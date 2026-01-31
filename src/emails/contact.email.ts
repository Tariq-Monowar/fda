export const contactFormEmailTemplate = (params: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): string => {
  const { name, email, subject, message } = params;
  const escapedName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedEmail = email.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedSubject = subject.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contact Form</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f3f4f6; color: #111827; padding: 24px; margin: 0; }
    .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; margin: 0 0 24px; color: #111827; }
    .field { margin-bottom: 16px; }
    .label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .value { font-size: 15px; color: #111827; }
    .message { white-space: pre-wrap; line-height: 1.5; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Contact form submission</h1>
    <div class="field">
      <div class="label">Name</div>
      <div class="value">${escapedName}</div>
    </div>
    <div class="field">
      <div class="label">Email</div>
      <div class="value">${escapedEmail}</div>
    </div>
    <div class="field">
      <div class="label">Subject</div>
      <div class="value">${escapedSubject}</div>
    </div>
    <hr />
    <div class="field">
      <div class="label">Message</div>
      <div class="value message">${escapedMessage}</div>
    </div>
  </div>
</body>
</html>
`.trim();
};
