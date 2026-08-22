/**
 * BizForm「沖煞日子媒合」表單 — 提交後自動計算沖煞備註並寫回
 *
 * 已依實際回傳 JSON（含「出殯日期」欄位 field_128，格式 YYYY/MM/DD）確認過。
 *
 * 使用方式：
 *   1. 環境變數 BIZFORM_API_KEY 放您的 x-api-key
 *   2. 部署到任何能收 Webhook 的地方（Vercel / Cloudflare Worker / 自架主機皆可）
 *   3. BizForm > Webhooks 新增一筆，url 指向這支程式，trigger 選「表單提交/建立完成」
 *      （trigger 數值還沒實測過，部署後用 BizForm 實際提交一次測試）
 *
 * 執行環境：Node.js 18+ (需要內建 fetch)
 */

const express = require('express');
const app = express();
app.use(express.json());

// ========== 設定區 ==========
const BIZFORM_BASE = 'https://bizform.vitalyun.com/backend/api';
const API_KEY = process.env.BIZFORM_API_KEY; // BizForm 後台建立的那組 x-api-key

// ========== 角色 → 欄位 id 對照表（已依實際回傳 JSON 確認） ==========
const ROLE_FIELDS = [
  { label: '杖期夫',   year: 'field_1',  zodiac: 'field_2',  remark: 'field_83' },
  { label: '護喪妻',   year: 'field_3',  zodiac: 'field_4',  remark: 'field_84' },
  { label: '孝男1',    year: 'field_5',  zodiac: 'field_6',  remark: 'field_85' },
  { label: '孝男2',    year: 'field_7',  zodiac: 'field_8',  remark: 'field_86' },
  { label: '孝男3',    year: 'field_9',  zodiac: 'field_10', remark: 'field_87' },
  { label: '孝男4',    year: 'field_11', zodiac: 'field_12', remark: 'field_88' },
  { label: '孝男5',    year: 'field_13', zodiac: 'field_14', remark: 'field_89' },
  { label: '孝男6',    year: 'field_15', zodiac: 'field_16', remark: 'field_90' },
  { label: '孝男7',    year: 'field_17', zodiac: 'field_18', remark: 'field_91' },
  { label: '孝男8',    year: 'field_19', zodiac: 'field_20', remark: 'field_92' },
  { label: '孝媳1',    year: 'field_21', zodiac: 'field_22', remark: 'field_93' },
  { label: '孝媳2',    year: 'field_23', zodiac: 'field_24', remark: 'field_94' },
  { label: '孝媳3',    year: 'field_25', zodiac: 'field_26', remark: 'field_95' },
  { label: '孝媳4',    year: 'field_27', zodiac: 'field_28', remark: 'field_96' },
  { label: '孝媳5',    year: 'field_29', zodiac: 'field_30', remark: 'field_97' },
  { label: '孝媳6',    year: 'field_31', zodiac: 'field_32', remark: 'field_98' },
  { label: '孝媳7',    year: 'field_33', zodiac: 'field_34', remark: 'field_99' },
  { label: '孝媳8',    year: 'field_35', zodiac: 'field_36', remark: 'field_100' },
  { label: '孝女1',    year: 'field_37', zodiac: 'field_38', remark: 'field_101' },
  { label: '孝女2',    year: 'field_41', zodiac: 'field_42', remark: 'field_102' },
  { label: '孝女3',    year: 'field_43', zodiac: 'field_44', remark: 'field_103' },
  { label: '孝女4',    year: 'field_45', zodiac: 'field_46', remark: 'field_104' },
  { label: '孝女5',    year: 'field_47', zodiac: 'field_48', remark: 'field_105' },
  { label: '孝女6',    year: 'field_49', zodiac: 'field_50', remark: 'field_106' },
  { label: '孝女7',    year: 'field_51', zodiac: 'field_52', remark: 'field_107' },
  { label: '孝女8',    year: 'field_53', zodiac: 'field_54', remark: 'field_108' },
  { label: '孝長孫',   year: 'field_55', zodiac: 'field_56', remark: 'field_109' },
  { label: '孝長孫媳', year: 'field_57', zodiac: 'field_58', remark: 'field_110' },
  { label: '孝孫1',    year: 'field_59', zodiac: 'field_60', remark: 'field_111' },
  { label: '孝孫2',    year: 'field_61', zodiac: 'field_62', remark: 'field_112' },
  { label: '孝孫3',    year: 'field_63', zodiac: 'field_64', remark: 'field_113' },
  { label: '孝孫4',    year: 'field_65', zodiac: 'field_66', remark: 'field_114' },
  { label: '孝孫媳1',  year: 'field_67', zodiac: 'field_68', remark: 'field_115' },
  { label: '孝孫媳2',  year: 'field_69', zodiac: 'field_70', remark: 'field_116' },
  { label: '孝孫媳3',  year: 'field_71', zodiac: 'field_72', remark: 'field_117' },
  { label: '孝孫媳4',  year: 'field_73', zodiac: 'field_74', remark: 'field_118' },
  { label: '孝孫女1',  year: 'field_75', zodiac: 'field_76', remark: 'field_119' },
  { label: '孝孫女2',  year: 'field_77', zodiac: 'field_78', remark: 'field_120' },
  { label: '孝孫女3',  year: 'field_79', zodiac: 'field_80', remark: 'field_121' },
  { label: '孝孫女4',  year: 'field_81', zodiac: 'field_82', remark: 'field_122' },
];
const DECEASED_YEAR_FIELD = 'field_124';
const DECEASED_ZODIAC_FIELD = 'field_125';
const FUNERAL_DATE_FIELD = 'field_128'; // 出殯日期，格式 YYYY/MM/DD
const TARGET_FORM_ID = 13; // 「沖煞日子媒合」表單的 form.id，安全檢查用

// ========== 生肖判斷邏輯 ==========
const ANIMAL_TO_BRANCH = { 鼠:0, 牛:1, 虎:2, 兔:3, 龍:4, 蛇:5, 馬:6, 羊:7, 猴:8, 雞:9, 狗:10, 豬:11 };
const ANIMALS = ['鼠','牛','虎','兔','龍','蛇','馬','羊','猴','雞','狗','豬'];

function isSixClash(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return (a + 6) % 12 === b || (b + 6) % 12 === a;
}

// 出殯日期字串（可能是 YYYY/MM/DD 或 YYYY-MM-DD）→ 當日「沖」到的生肖 branch index
// 採用甲子日回推法試算，僅供參考；若禮儀師已有正式日課，建議改用禮儀師提供的沖生肖覆蓋
function dayClashBranchFromDate(dateStr) {
  if (!dateStr) return null;
  const normalized = dateStr.trim().replace(/\//g, '-');
  const d = new Date(normalized + 'T00:00:00Z').getTime();
  if (isNaN(d)) return null;
  const epoch = Date.UTC(1900, 0, 31); // 甲子日（子，index 0）
  const diffDays = Math.floor((d - epoch) / 86400000);
  const dayBranch = ((diffDays % 12) + 12) % 12;
  return (dayBranch + 6) % 12; // 當日沖到的生肖 = 該日地支的六沖對象
}

function computeRemark(person, deceased, dayClashBranch) {
  const branch = ANIMAL_TO_BRANCH[person.zodiac];
  if (branch === undefined) return '';

  const remarks = [];

  if (deceased.branch !== undefined) {
    if (isSixClash(branch, deceased.branch)) {
      remarks.push('沖煞不宜近棺');
    } else if (branch === deceased.branch) {
      remarks.push('逢太歲蓋棺不宜直視');
    }
  }

  if (dayClashBranch !== null && branch === dayClashBranch) {
    remarks.push('沖煞不宜送葬');
  }

  const pYear = parseInt(person.year, 10);
  const dYear = parseInt(deceased.year, 10);
  if (!isNaN(pYear) && !isNaN(dYear)) {
    const diff = Math.abs(dYear - pYear);
    if (diff > 0 && diff % 6 === 0) {
      remarks.push('歲沖不宜近棺');
    }
  }
  if (!isNaN(pYear)) {
    const refYear = new Date().getFullYear();
    const age = refYear - pYear + 1;
    if (age > 0 && age % 9 === 0) {
      remarks.push('逢九不宜抬棺');
    }
  }

  return remarks.join('；');
}

// ========== BizForm API 呼叫 ==========
async function getDocument(id) {
  const res = await fetch(`${BIZFORM_BASE}/Documents/${id}`, {
    headers: { 'x-api-key': API_KEY, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GET Documents/${id} failed: ${res.status}`);
  return res.json();
}

async function updateDocument(id, doc) {
  const res = await fetch(`${BIZFORM_BASE}/Documents/${id}`, {
    method: 'PUT', // 已實測驗證：這支 API 要用 PUT，POST 會回 405
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(doc),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST Documents/${id} failed: ${res.status} ${text}`);
  }
}

function getVal(attrs, id) {
  const a = attrs.find(x => x.id === id);
  return a && a.value && a.value[0] !== undefined ? a.value[0] : '';
}
function setVal(attrs, id, value) {
  const a = attrs.find(x => x.id === id);
  if (a) a.value = [value];
}

// ========== Webhook 接收端點 ==========
app.post('/bizform-webhook', async (req, res) => {
  try {
    const documentId = req.body.documentId || req.body.id;
    if (!documentId) return res.status(400).json({ error: 'missing documentId' });

    const doc = await getDocument(documentId);

    // 安全檢查：只處理「沖煞日子媒合」這張表單，其他表單（例如訃聞表單）一律跳過
    if (!doc.form || doc.form.id !== TARGET_FORM_ID) {
      console.log(`跳過：documentId=${documentId} 不是沖煞日子媒合表單（form.id=${doc.form && doc.form.id}）`);
      return res.status(200).json({ ok: true, skipped: true, reason: 'not target form' });
    }

    const attrs = doc.attributes || [];

    const deceased = {
      year: getVal(attrs, DECEASED_YEAR_FIELD),
      zodiac: getVal(attrs, DECEASED_ZODIAC_FIELD),
    };
    deceased.branch = ANIMAL_TO_BRANCH[deceased.zodiac];

    const funeralDate = getVal(attrs, FUNERAL_DATE_FIELD);
    const dayClashBranch = dayClashBranchFromDate(funeralDate);

    ROLE_FIELDS.forEach(role => {
      const person = {
        year: getVal(attrs, role.year),
        zodiac: getVal(attrs, role.zodiac),
      };
      const remark = computeRemark(person, deceased, dayClashBranch);
      setVal(attrs, role.remark, remark);
    });

    doc.attributes = attrs;
    await updateDocument(documentId, doc);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook receiver listening on :${PORT}`));
