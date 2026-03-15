const https = require("https");

exports.handler = async function(event) {
  const query = event.queryStringParameters && event.queryStringParameters.query;
  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: "query 없음" }) };
  }

  const CLIENT_ID = "GeceAEAtcWCxDPXj0vTL";
  const CLIENT_SECRET = "fyEl26uZY_";

  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    const path = `/v1/search/shop.json?query=${encodedQuery}&display=10&sort=asc`;

    const options = {
      hostname: "openapi.naver.com",
      port: 443,
      path: path,
      method: "GET",
      headers: {
        "X-Naver-Client-Id": CLIENT_ID,
        "X-Naver-Client-Secret": CLIENT_SECRET,
        "Accept": "application/json"
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        console.log("STATUS:", res.statusCode);
        console.log("BODY:", data.substring(0, 200));
        try {
          const parsed = JSON.parse(data);
          resolve({
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              status: res.statusCode,
              items: parsed.items || [],
              total: parsed.total || 0,
              raw: parsed
            })
          });
        } catch(e) {
          resolve({
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ items: [], error: "파싱 오류", raw: data })
          });
        }
      });
    });

    req.on("error", (e) => {
      console.log("ERROR:", e.message);
      resolve({
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: e.message, items: [] })
      });
    });

    req.end();
  });
};
