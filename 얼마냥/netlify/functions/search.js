const { getStore } = require("@netlify/blobs");

exports.handler = async function(event) {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { email, productTitle, productLink, productImage, currentPrice, targetPrice } = JSON.parse(event.body);

    if (!email || !productTitle || !targetPrice) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "필수 항목 누락" }) };
    }

    // 이메일 유효성 검사
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "이메일 형식 오류" }) };
    }

    const store = getStore("alerts");

    // 기존 알림 목록 가져오기
    let alerts = [];
    try {
      const existing = await store.get("list");
      if (existing) alerts = JSON.parse(existing);
    } catch(e) { alerts = []; }

    // 중복 체크 (같은 이메일 + 같은 상품)
    const isDuplicate = alerts.some(a => a.email === email && a.productLink === productLink);
    if (isDuplicate) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: "이미 등록된 알림이에요!" }) };
    }

    // 새 알림 추가
    const newAlert = {
      id: Date.now().toString(),
      email,
      productTitle,
      productLink,
      productImage: productImage || "",
      currentPrice: Number(currentPrice),
      targetPrice: Number(targetPrice),
      registeredAt: new Date().toISOString(),
      notified: false
    };

    alerts.push(newAlert);
    await store.set("list", JSON.stringify(alerts));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "알림 등록 완료! 목표가 도달 시 이메일로 알려드릴게요 🐱" })
    };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
