/**
 * BizForm「沖煞日子媒合」表單 — 提交後自動計算沖煞禁忌，統一寫進最後的「備註」欄位
 * （2026/9/9 表單改版：家屬資料改成「可重複新增列」的子表格結構，存放在 subDocuments 裡）
 *
 * 備註格式：有填姓名用「姓名」（加「」括號），沒填姓名則用「角色標籤+序號」（例如孝男2）
 * 若所有人都沒有禁忌，寫入「無禁忌」
 */

const express = require('express');
const app = express();
app.use(express.json());

// ========== 設定區 ==========
const BIZFORM_BASE = 'https://bizform.vitalyun.com/backend/api';
const API_KEY = process.env.BIZFORM_API_KEY;

const CRM_JWT = process.env.BIZFORM_JWT;
const DEPOT_ID = process.env.BIZFORM_DEPOT_ID || 'bc6bc14f5b30499ab40f760c63fa4eb2';
const CRM_TENANT_ID = process.env.BIZFORM_CRM_TENANT_ID || 'faca5f8b5a0b696fa2d5d1cdb1a31185';

const CUSTOMER_NAME_FIELD_ID = 'field_133';
const CUSTOMER_PHONE_FIELD_ID = 'field_134';

const DECEASED_NAME_FIELD = 'field_124';
const DECEASED_YEAR_FIELD = 'field_125';
const DECEASED_ZODIAC_FIELD = 'field_177';
const FUNERAL_DATE_FIELD = 'field_178';
const FINAL_REMARK_FIELD = 'field_131';
const TARGET_FORM_ID = 13;

// 每個角色對應的「子表格群組id(title)」以及群組內姓名/年次/生肖各自的 field id
// （2026/9/9 改版後的新結構：家屬資料在 doc.subDocuments 裡，每筆代表一位家屬）
const GROUP_CONFIGS = [
  { label: '杖期夫',   titleId: 'field_181', nameField: 'field_183', yearField: 'field_184', zodiacField: 'field_185' },
  { label: '護喪妻',   titleId: 'field_186', nameField: 'field_188', yearField: 'field_189', zodiacField: 'field_190' },
  { label: '孝男',     titleId: 'field_191', nameField: 'field_193', yearField: 'field_194', zodiacField: 'field_195' },
  { label: '孝媳',     titleId: 'field_196', nameField: 'field_198', yearField: 'field_199', zodiacField: 'field_200' },
  { label: '孝女',     titleId: 'field_201', nameField: 'field_203', yearField: 'field_204', zodiacField: 'field_205' },
  { label: '孝長孫',   titleId: 'field_206', nameField: 'field_208', yearField: 'field_209', zodiacField: 'field_210' },
  { label: '孝長孫媳', titleId: 'field_216', nameField: 'field_218', yearField: 'field_219', zodiacField: 'field_220' },
  { label: '孝孫',     titleId: 'field_226', nameField: 'field_228', yearField: 'field_229', zodiacField: 'field_230' },
  { label: '孝孫媳',   titleId: 'field_221', nameField: 'field_223', yearField: 'field_224', zodiacField: 'field_225' },
  { label: '孝孫女',   titleId: 'field_211', nameField: 'field_213', yearField: 'field_214', zodiacField: 'field_215' },
];

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

function bearerHeader() {
  return CRM_JWT.startsWith('Bearer') ? CRM_JWT : `Bearer ${CRM_JWT}`;
}

async function findExistingCrmCustomerId(name, phone) {
  if (!CRM_JWT || !name) return null;
  const normalizedPhone = String(phone || '').replace(/[\s-]/g, '');
  const url = `${BIZFORM_BASE}/ExResources/CRM/customers?storedId=1&name=${encodeURIComponent(name)}&pageSize=50`;
  const res = await fetch(url, {
    headers: { Authorization: bearerHeader(), depotId: DEPOT_ID, accept: 'application/json' },
  });
  if (!res.ok) {
    console.error('CRM 客戶搜尋失敗:', res.status, await res.text());
    return null;
  }
  const customers = await res.json();
  if (!Array.isArray(customers)) return null;
  for (const cust of customers) {
    const mechs = cust.contactMechs || [];
    const matched = mechs.some(m => String(m.value || '').replace(/[\s-]/g, '') === normalizedPhone);
    if (matched) return cust.customerId || cust.id;
  }
  return null;
}

function linkExistingCustomer(attrs, existingCustomerId) {
  const attr = attrs.find(a => a.id === CUSTOMER_NAME_FIELD_ID);
  if (!attr || !attr.fieldInfo) return false;
  attr.fieldInfo.value = ['related', 'crm', 'main', CRM_TENANT_ID, 'customers', existingCustomerId];
  return true;
}

async function syncToCrm(documentId) {
  if (!CRM_JWT) {
    console.log('尚未設定 BIZFORM_JWT，略過 CRM 同步');
    return null;
  }
  const url = `${BIZFORM_BASE}/Documents/${documentId}/crmItems?version=0`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: bearerHeader(), depotId: DEPOT_ID, accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('CRM 同步失敗:', res.status, text);
    return null;
  }
  console.log('CRM 同步結果:', text);
  return JSON.parse(text);
}

function getVal(attrs, id) {
  const a = attrs.find(x => x.id === id);
  return a && a.value && a.value[0] !== undefined ? a.value[0] : '';
}
function setVal(attrs, id, value) {
  const a = attrs.find(x => x.id === id);
  if (a) a.value = [value];
}

// ========== 從新版 subDocuments 結構讀出所有家屬 ==========
function extractFamilyMembers(doc) {
  const subDocs = doc.subDocuments || [];
  const members = [];
  // 用來給沒填姓名的人做角色序號（同角色第幾筆）
  const roleCounters = {};

  subDocs.forEach(sub => {
    const config = GROUP_CONFIGS.find(g => g.titleId === sub.title);
    if (!config) return; // 不認得的群組，跳過

    const subAttrs = sub.attributes || [];
    const name = getVal(subAttrs, config.nameField);
    const year = getVal(subAttrs, config.yearField);
    const zodiac = getVal(subAttrs, config.zodiacField);

    // 完全空白的列（使用者沒填任何資料）就跳過，不計入序號
    if (!name && !year && !zodiac) return;

    roleCounters[config.label] = (roleCounters[config.label] || 0) + 1;
    const seq = roleCounters[config.label];

    members.push({
      label: config.label,
      seq,
      name,
      year,
      zodiac,
    });
  });

  return members;
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

    const familyMembers = extractFamilyMembers(doc);

    const summary = [];
    // 同角色若有多筆，角色標籤要加序號（例如孝男1、孝男2），只有單一筆時角色標籤不加序號也清楚，但為了一致性一律加序號
    const roleTotalCount = {};
    familyMembers.forEach(m => { roleTotalCount[m.label] = (roleTotalCount[m.label] || 0) + 1; });

    familyMembers.forEach(person => {
      const taboos = computeTaboos(person, deceased, dayClashBranch);
      if (taboos.length) {
        const roleLabel = roleTotalCount[person.label] > 1 ? `${person.label}${person.seq}` : person.label;
        const displayName = person.name && person.name.trim()
          ? `「${person.name.trim()}」`
          : roleLabel;
        summary.push(`${displayName}${taboos.join('、')}`);
      }
    });

    const finalText = summary.length ? summary.join('、') : '無禁忌';
    setVal(attrs, FINAL_REMARK_FIELD, finalText);

    // 送CRM之前，先用姓名+電話查詢CRM有沒有既有客戶，有的話補上真正的客戶ID
    const custName = getVal(attrs, CUSTOMER_NAME_FIELD_ID);
    const custPhone = getVal(attrs, CUSTOMER_PHONE_FIELD_ID);
    const existingCustomerId = await findExistingCrmCustomerId(custName, custPhone).catch(err => {
      console.error('CRM 客戶搜尋發生例外:', err.message);
      return null;
    });
    if (existingCustomerId) {
      linkExistingCustomer(attrs, existingCustomerId);
      console.log(`比對到既有CRM客戶(${custName})，將更新而非新增：${existingCustomerId}`);
    }

    doc.attributes = attrs;
    await updateDocument(documentId, doc);

    const crmResult = await syncToCrm(documentId).catch(err => {
      console.error('CRM 同步發生例外:', err.message);
      return null;
    });

    res.status(200).json({ ok: true, remark: finalText, familyCount: familyMembers.length, crm: crmResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook receiver listening on :${PORT}`));
