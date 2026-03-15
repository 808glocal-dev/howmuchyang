const https = require("https");

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const COUPANG_AF_ID = process.env.COUPANG_AF_ID || "";

// 쿠팡 추적 링크 생성
function makeCoupangLink(query) {
  if (!COUPANG_AF_ID) return `https://www.coupang.com/np/search?q=${encodeURIComponent(query)}`;
  return `https://link.coupang.com/a/${COUPANG_AF_ID}?q=${encodeURIComponent(query)}`;
}

exports.handler = async function(event) {
  const query = event.queryStringParameters && event.queryStringParameters.query;
  const sort = event.queryStringParameters && event.queryStringParameters.sort || "sim";

  if (!query) return { statusCode: 400, body: JSON.stringify({ error: "query 없음" }) };

  const validSort = ["sim","date","asc","dsc"].includes(sort) ? sort : "sim";

  const fetchPage = (startNum) => new Promise((resolve) => {
    const path = `/v1/search/shop.json?query=${encodeURIComponent(query)}&display=30&start=${startNum}&sort=${validSort}`;
    const options = {
      hostname: "openapi.naver.com", port: 443, path,
      method: "GET",
      headers: {
        "X-Naver-Client-Id": CLIENT_ID,
        "X-Naver-Client-Secret": CLIENT_SECRET,
        "Accept": "application/json"
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ items: [] }); }
      });
    });
    req.on("error", () => resolve({ items: [] }));
    req.end();
  });

  try {
    const [page1, page2] = await Promise.all([fetchPage(1), fetchPage(31)]);
    const items = [...(page1.items || []), ...(page2.items || [])];
    const coupangLink = makeCoupangLink(query);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ items, total: page1.total || 0, coupangLink })
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: e.message, items: [] })
    };
  }
};
