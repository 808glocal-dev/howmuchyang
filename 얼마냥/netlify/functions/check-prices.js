const https = require("https");
const { getStore } = require("@netlify/blobs");

// 매일 오전 9시 실행
exports.config = {
  schedule: "0 0 9 * * *"
};

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "얼마냥 <noreply@howmuchyang.netlify.app>";

// 현재 가격 조회
function fetchPrice(query) {
  return new Promise((resolve) => {
    const path = `/v1/search/shop.json?query=${encodeURIComponent(query)}&display=5&sort=asc`;
    const options = {
      hostname: "openapi.naver.com", port: 443, path,
      method: "GET",
      headers: {
        "X-Naver-Client-Id": CLIENT_ID,
        "X-Naver-Client-Secret": CLIENT_SECRET
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const items = parsed.items || [];
          const lowest = items.reduce((min, item) => {
            const p = Number(item.lprice);
            return p < min ? p : min;
          }, Infinity);
          resolve(lowest === Infinity ? null : lowest);
        } catch(e) { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}

// 이메일 발송 (Resend)
function sendEmail(to, subject, html) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html
    });

    const options = {
      hostname: "api.resend.com",
      port: 443,
      path: "/emails",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", (e) => resolve({ status: 500, error: e.message }));
    req.write(body);
    req.end();
  });
}

function makeEmailHtml(alert, currentPrice) {
  const savings = alert.targetPrice - currentPrice;
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"/></head>
<body style="font-family:'Apple SD Gothic Neo',sans-serif;background:#fff8f5;margin:0;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">

    <div style="background:linear-gradient(135deg,#FF6B6B,#FF8E53);padding:24px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">🐱</div>
      <h1 style="color:white;margin:0;font-size:20px;">최저가 알림이 왔어요!</h1>
      <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:13px;">얼마냥이 목표가를 감지했어요</p>
    </div>

    <div style="padding:20px;">
      ${alert.productImage ? `<img src="${alert.productImage}" style="width:80px;height:80px;border-radius:10px;object-fit:cover;margin-bottom:12px;border:1px solid #f0f0f0;" />` : ""}

      <p style="font-size:14px;color:#333;font-weight:600;margin:0 0 16px;line-height:1.5;">${alert.productTitle.replace(/<[^>]*>/g,"")}</p>

      <div style="background:#fff5f0;border-radius:12px;padding:16px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:13px;color:#888;">목표 가격</span>
          <span style="font-size:13px;color:#333;">${Number(alert.targetPrice).toLocaleString("ko-KR")}원</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:13px;color:#888;">현재 가격</span>
          <span style="font-size:18px;color:#FF6B6B;font-weight:900;">${Number(currentPrice).toLocaleString("ko-KR")}원</span>
        </div>
        <div style="border-top:1px solid #f0e8e8;padding-top:8px;display:flex;justify-content:space-between;">
          <span style="font-size:13px;color:#888;">절약 금액</span>
          <span style="font-size:13px;color:#3B6D11;font-weight:700;">-${Number(savings).toLocaleString("ko-KR")}원</span>
        </div>
      </div>

      <a href="${alert.productLink}" style="display:block;background:linear-gradient(135deg,#FF6B6B,#FF8E53);color:white;text-decoration:none;text-align:center;padding:14px;border-radius:12px;font-size:15px;font-weight:700;margin-bottom:16px;">
        지금 바로 구매하기 →
      </a>

      <div style="background:#f0fff4;border-radius:12px;padding:14px;text-align:center;">
        <p style="font-size:12px;color:#3B6D11;margin:0;line-height:1.6;">
          🐱 얼마냥 수익의 일부는 유기묘 보호단체에 기부돼요<br/>
          <strong>이 구매가 고양이를 도와요</strong>
        </p>
      </div>
    </div>

    <div style="padding:12px 20px;border-top:1px solid #f0e8e8;text-align:center;">
      <p style="font-size:11px;color:#bbb;margin:0;">얼마냥 · 최저가를 냥냥 알려드려요 🐱</p>
    </div>
  </div>
</body>
</html>`;
}

exports.handler = async function() {
  console.log("가격 체크 시작:", new Date().toISOString());

  const store = getStore("alerts");
  let alerts = [];

  try {
    const existing = await store.get("list");
    if (existing) alerts = JSON.parse(existing);
  } catch(e) {
    console.log("알림 목록 없음");
    return { statusCode: 200, body: "알림 없음" };
  }

  if (alerts.length === 0) {
    return { statusCode: 200, body: "알림 없음" };
  }

  let updated = false;

  for (const alert of alerts) {
    if (alert.notified) continue;

    try {
      // 상품명으로 현재 가격 조회
      const title = alert.productTitle.replace(/<[^>]*>/g,"").substring(0, 30);
      const currentPrice = await fetchPrice(title);

      console.log(`체크: ${title} → 현재 ${currentPrice}원 / 목표 ${alert.targetPrice}원`);

      if (currentPrice && currentPrice <= alert.targetPrice) {
        // 이메일 발송
        const result = await sendEmail(
          alert.email,
          `🐱 얼마냥 최저가 알림: ${title.substring(0,20)}... ${currentPrice.toLocaleString("ko-KR")}원!`,
          makeEmailHtml(alert, currentPrice)
        );

        console.log(`이메일 발송: ${alert.email} → ${result.status}`);

        if (result.status === 200) {
          alert.notified = true;
          alert.notifiedAt = new Date().toISOString();
          alert.finalPrice = currentPrice;
          updated = true;
        }
      }

      // API 과부하 방지
      await new Promise(r => setTimeout(r, 500));
    } catch(e) {
      console.error(`알림 처리 오류: ${e.message}`);
    }
  }

  if (updated) {
    await store.set("list", JSON.stringify(alerts));
  }

  return { statusCode: 200, body: `처리 완료: ${alerts.length}개 알림` };
};
