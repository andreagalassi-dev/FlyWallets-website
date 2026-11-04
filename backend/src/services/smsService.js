/**
 * SMS via Twilio's REST API (no SDK dependency). Configure:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 * Without them the message is printed to the console and the call still resolves successfully,
 * so local development needs no external account.
 */
const isConfigured = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );

exports.sendSms = async (to, body) => {
  if (!isConfigured()) {
    if (process.env.NODE_ENV !== "test") {
      console.log(`\n📱 [DEV SMS - Twilio not configured]\n   To: ${to}\n   ${body}\n`);
    }
    return { delivered: false, provider: "console" };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_PHONE_NUMBER, Body: body }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Twilio responded ${res.status}`);
    return { delivered: true, provider: "twilio" };
  } catch (err) {
    console.error(`❌ SMS delivery to ${to} failed:`, err.message);
    return { delivered: false, provider: "error" };
  }
};

exports.sendOtpSms = (to, code) =>
  exports.sendSms(to, `Your FlyWallets verification code is ${code}. It expires in 10 minutes.`);
