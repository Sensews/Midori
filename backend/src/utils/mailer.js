const nodemailer = require('nodemailer');

function getMailerConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.SMTP_FROM || '').trim();

  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    user,
    pass,
    from,
  };
}

function getTransporter() {
  const config = getMailerConfig();
  if (!config) {
    throw new Error('Serviço de email não configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM.');
  }

  return {
    config,
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    }),
  };
}

function renderEmailLayout({ preheader, title, subtitle, bodyHtml, footerHtml }) {
  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <div style="margin:0;padding:0;background:#ECECEC;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ECECEC;padding:24px 12px;font-family:Arial,'Poppins',sans-serif;color:#2D2D2D;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#F3F5F3;border-radius:16px;overflow:hidden;">
              <tr>
                <td style="padding:0;height:10px;background:#B5FF3F;"></td>
              </tr>
              <tr>
                <td style="padding:24px 24px 6px 24px;">
                  <div style="font-size:28px;font-weight:700;line-height:1;color:#435F17;">Midori</div>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 24px 0 24px;">
                  <h1 style="margin:0;font-size:28px;line-height:1.2;color:#2D2D2D;">${title}</h1>
                  <p style="margin:10px 0 0 0;font-size:15px;line-height:1.5;color:#6B6B6B;">${subtitle}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 24px 8px 24px;">${bodyHtml}</td>
              </tr>
              <tr>
                <td style="padding:0 24px 24px 24px;">
                  <div style="font-size:13px;line-height:1.6;color:#6B6B6B;border-top:1px solid #E0E0E0;padding-top:14px;">
                    ${footerHtml}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function sendSecurityCodeEmail({ to, subject, heading, code, expiresInMinutes }) {
  const { config, transporter } = getTransporter();

  const html = renderEmailLayout({
    preheader: `Seu código Midori expira em ${expiresInMinutes} minutos.`,
    title: heading,
    subtitle: 'Use este código para concluir sua autenticação.',
    bodyHtml: `
      <p style="margin:0 0 10px 0;font-size:15px;color:#2D2D2D;">Seu código de verificação:</p>
      <div style="display:inline-block;background:#FFFFFF;border:1px solid #E0E0E0;border-radius:12px;padding:14px 18px;font-size:34px;letter-spacing:10px;font-weight:700;color:#435F17;">
        ${code}
      </div>
      <p style="margin:14px 0 0 0;font-size:14px;color:#6B6B6B;">Esse código expira em <strong style="color:#2D2D2D;">${expiresInMinutes} minutos</strong>.</p>
    `,
    footerHtml: 'Se você não solicitou este acesso, ignore este email com segurança.',
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text: `${heading}\n\nCódigo: ${code}\nExpira em ${expiresInMinutes} minutos.`,
    html,
  });
}

async function sendPasswordResetLinkEmail({ to, subject, heading, resetLink, expiresInMinutes }) {
  const { config, transporter } = getTransporter();

  const html = renderEmailLayout({
    preheader: `Link de redefinição Midori válido por ${expiresInMinutes} minutos.`,
    title: heading,
    subtitle: 'Recebemos uma solicitação para alterar sua senha.',
    bodyHtml: `
      <p style="margin:0 0 14px 0;font-size:15px;color:#2D2D2D;">Clique no botão abaixo para criar uma nova senha:</p>
      <p style="margin:0 0 10px 0;">
        <a href="${resetLink}" style="display:inline-block;padding:12px 20px;background:#435F17;color:#F3F5F3;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;">Redefinir senha</a>
      </p>
      <p style="margin:10px 0 0 0;font-size:14px;color:#6B6B6B;">Este link expira em <strong style="color:#2D2D2D;">${expiresInMinutes} minutos</strong>.</p>
      <p style="margin:12px 0 0 0;font-size:12px;line-height:1.4;color:#6B6B6B;word-break:break-all;">Se o botão não abrir, copie este endereço:\n${resetLink}</p>
    `,
    footerHtml: 'Se você não solicitou a recuperação, ignore este email. Sua conta permanecerá segura.',
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text: `${heading}\n\nAbra este link para redefinir sua senha:\n${resetLink}\n\nExpira em ${expiresInMinutes} minutos.`,
    html,
  });
}

async function sendSecurityNoticeEmail({ to, subject, heading, message }) {
  const { config, transporter } = getTransporter();

  const html = renderEmailLayout({
    preheader: heading,
    title: heading,
    subtitle: 'Aviso de segurança da sua conta Midori.',
    bodyHtml: `
      <p style="margin:0;font-size:15px;line-height:1.6;color:#2D2D2D;">${String(message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    `,
    footerHtml: 'Se você não reconhece esta ação, altere sua senha e contate a equipe imediatamente.',
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text: `${heading}\n\n${message}`,
    html,
  });
}

module.exports = {
  sendSecurityCodeEmail,
  sendPasswordResetLinkEmail,
  sendSecurityNoticeEmail,
};
