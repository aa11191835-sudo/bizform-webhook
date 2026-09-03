/**
 * BizForm「沖煞日子媒合」表單 — 提交後自動計算沖煞禁忌，統一寫進最後的「備註」欄位
 * 備註格式改為使用「家屬姓名」（若該角色姓名有填），沒填姓名則退回用角色標籤
 *
 * 輸出格式範例：王小明蓋棺不宜直視、頭七不宜參加、林小華不宜抬棺
 * 若所有人都沒有禁忌，寫入「無禁忌」
 */

const express = require('express');
const app = express();
app.use(express.json());

// ========== 設定區 ==========
const BIZFORM_BASE = 'https://bizform.vitalyun.com/backend/api';
const API_KEY = process.env.BIZFORM_API_KEY;

// ========== 角色 → 姓名/年次/生肖欄位 id 對照表（2026/9/3 表單改版後最新版） ==========
const ROLE_FIELDS = [
  { label: '杖期夫',   name: 'field_1',  year: 'field_137', zodiac: 'field_2' },
  { label: '護喪妻',   name: 'field_3',  year: 'field_138', zodiac: 'field_4' },
  { label: '孝男1',    name: 'field_5',  year: 'field_139', zodiac: 'field_6' },
  { label: '孝男2',    name: 'field_7',  year: 'field_140', zodiac: 'field_8' },
  { label: '孝男3',    name: 'field_9',  year: 'field_141', zodiac: 'field_10' },
  { label: '孝男4',    name: 'field_11', year: 'field_142', zodiac: 'field_12' },
  { label: '孝男5',    name: 'field_13', year: 'field_143', zodiac: 'field_14' },
  { label: '孝男6',    name: 'field_15', year: 'field_144', zodiac: 'field_16' },
  { label: '孝男7',    name: 'field_17', year: 'field_145', zodiac: 'field_18' },
  { label: '孝男8',    name: 'field_19', year: 'field_146', zodiac: 'field_20' },
  { label: '孝媳1',    name: 'field_21', year: 'field_147', zodiac: 'field_22' },
  { label: '孝媳2',    name: 'field_23', year: 'field_148', zodiac: 'field_24' },
  { label: '孝媳3',    name: 'field_25', year: 'field_149', zodiac: 'field_26' },
  { label: '孝媳4',    name: 'field_27', year: 'field_150', zodiac: 'field_28' },
  { label: '孝媳5',    name: 'field_29', year: 'field_151', zodiac: 'field_30' },
  { label: '孝媳6',    name: 'field_31', year: 'field_152', zodiac: 'field_32' },
  { label: '孝媳7',    name: 'field_33', year: 'field_153', zodiac: 'field_34' },
  { label: '孝媳8',    name: 'field_35', year: 'field_154', zodiac: 'field_36' },
  { label: '孝女1',    name: 'field_37', year: 'field_155', zodiac: 'field_38' },
  { label: '孝女2',    name: 'field_41', year: 'field_156', zodiac: 'field_42' },
  { label: '孝女3',    name: 'field_43', year: 'field_157', zodiac: 'field_44' },
  { label: '孝女4',    name: 'field_45', year: 'field_158', zodiac: 'field_46' },
  { label: '孝女5',    name: 'field_47', year: 'field_159', zodiac: 'field_48' },
  { label: '孝女6',    name: 'field_49', year: 'field_160', zodiac: 'field_50' },
  { label: '孝女7',    name: 'field_51', year: 'field_161', zodiac: 'field_52' },
  { label: '孝女8',    name: 'field_53', year: 'field_162', zodiac: 'field_54' },
  { label: '孝長孫',   name: 'field_55', year: 'field_163', zodiac: 'field_56' },
  { label: '孝長孫媳', name: 'field_57', year: 'field_164', zodiac: 'field_58' },
  { label: '孝孫1',    name: 'field_59', year: 'field_165', zodiac: 'field_60' },
  { label: '孝孫2',    name: 'field_61', year: 'field_166', zodiac: 'field_62' },
  { label: '孝孫3',    name: 'field_63', year: 'field_167', zodiac: 'field_64' },
  { label: '孝孫4',    name: 'field_65', year: 'field_168', zodiac: 'field_66' },
  { label: '孝孫媳1',  name: 'field_67', year: 'field_169', zodiac: 'field_68' },
  { label: '孝孫媳2',  name: 'field_69', year: 'field_170', zodiac: 'field_70' },
  { label: '孝孫媳3',  name: 'field_71', year: 'field_171', zodiac: 'field_72' },
  { label: '孝孫媳4',  name: 'field_73', year: 'field_172', zodiac: 'field_74' },
  { label: '孝孫女1',  name: 'field_75', year: 'field_173', zodiac: 'field_76' },
  { label: '孝孫女2',  name: 'field_77', year: 'field_174', zodiac: 'field_78' },
  { label: '孝孫女3',  name: 'field_79', year: 'field_175', zodiac: 'field_80' },
  { label: '孝孫女4',  name: 'field_81', year: 'field_176', zodiac: 'field_82' },
];
const DECEASED_NAME_FIELD = 'field_124';   // 亡者姓名
const DECEASED_YEAR_FIELD = 'field_125';   // 亡者年次
const DECEASED_ZODIAC_FIELD = 'field_177'; // 亡者生肖
const FUNERAL_DATE_FIELD = 'field_178';    // 出殯日期
const FINAL_REMARK_FIELD = 'field_131';    // 最後統一的「備註」欄位
const TARGET_FORM_ID = 13; // 「沖煞日子媒合」表單 form.id，安全檢查用

// ========== 生肖判斷邏輯 ==========
const ANIMAL_TO_BRANCH = { 鼠:0, 牛:1, 虎:2, 兔:3, 龍:4, 蛇:5, 馬:6, 羊:7, 猴:8, 雞:9, 狗:10, 豬:11 };

function isSixClash(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return (a + 6) % 12 === b || (b + 6) % 12 === a;
}

function dayClashBranchFromDate(dateStr) {
  if (!dateStr) return null;
  const normalized = dateStr.trim().replace(/\//g, '-');
  const d = new Date(normalized + 'T00:00:00Z').getTime();
  if (isNaN(d)) return null;
  const epoch = Date.UTC(1900, 0, 31); // 甲子日（子，index 0）
  const diffDays = Math.floor((d - epoch) / 86400000);
  const dayBranch = ((diffDays % 12) + 12) % 12;
  return (dayBranch + 6) % 12;
}

/**
 * 計算單一人的禁忌短語陣列（沒有禁忌則回傳空陣列）
 */
function computeTaboos(person, deceased, dayClashBranch) {
  const branch = ANIMAL_TO_BRANCH[person.zodiac];
  if (branch === undefined) return [];

  const taboos = [];

  if (deceased.branch !== undefined) {
    if (isSixClash(branch, deceased.branch)) {
      taboos.push('封釘、出殯不宜參加');
    } else if (branch === deceased.branch) {
      taboos.push('蓋棺不宜直視');
    }
  }

  if (dayClashBranch !== null && branch === dayClashBranch) {
    taboos.push('出殯當日不宜到場');
  }

  const pYear = parseInt(person.year, 10);
  const dYear = parseInt(deceased.year, 10);
  if (!isNaN(pYear) && !isNaN(dYear)) {
    const diff = Math.abs(dYear - pYear);
    if (diff > 0 && diff % 6 === 0) {
      taboos.push('頭七不宜參加');
    }
  }
  if (!isNaN(pYear)) {
    const refYear = new Date().getFullYear();
    const age = refYear - pYear + 1;
    if (age > 0 && age % 9 === 0) {
      taboos.push('不宜抬棺');
    }
  }

  return taboos;
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
    method: 'PUT',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(doc),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT Documents/${id} failed: ${res.status} ${text}`);
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

    if (!doc.form || doc.form.id !== TARGET_FORM_ID) {
      console.log(`跳過：documentId=${documentId} 不是沖煞日子媒合表單（form.id=${doc.form && doc.form.id}）`);
      return res.status(200).json({ ok: true, skipped: true, reason: 'not target form' });
    }

    const attrs = doc.attributes || [];

    const deceased = {
      name: getVal(attrs, DECEASED_NAME_FIELD),
      year: getVal(attrs, DECEASED_YEAR_FIELD),
      zodiac: getVal(attrs, DECEASED_ZODIAC_FIELD),
    };
    deceased.branch = ANIMAL_TO_BRANCH[deceased.zodiac];

    const funeralDate = getVal(attrs, FUNERAL_DATE_FIELD);
    const dayClashBranch = dayClashBranchFromDate(funeralDate);

    const summary = [];
    ROLE_FIELDS.forEach(role => {
      const person = {
        name: getVal(attrs, role.name),
        year: getVal(attrs, role.year),
        zodiac: getVal(attrs, role.zodiac),
      };
      const taboos = computeTaboos(person, deceased, dayClashBranch);
      if (taboos.length) {
        // 有填姓名就用姓名，沒填就退回用角色標籤（例如「孝男1」）
        const displayName = person.name && person.name.trim() ? person.name.trim() : role.label;
        summary.push(`${displayName}${taboos.join('、')}`);
      }
    });

    const finalText = summary.length ? summary.join('、') : '無禁忌';
    setVal(attrs, FINAL_REMARK_FIELD, finalText);

    doc.attributes = attrs;
    await updateDocument(documentId, doc);

    res.status(200).json({ ok: true, remark: finalText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook receiver listening on :${PORT}`));
