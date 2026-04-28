const nodemailer = require('nodemailer');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFrontendBaseUrl() {
  const explicit = String(process.env.FRONTEND_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return '';
}

function getAssetUrl(baseUrl, fileName) {
  if (!baseUrl) return '';
  return `${baseUrl}/Assets/${encodeURIComponent(fileName)}`;
}

function getEmailBrandAssets() {
  return {
    logo:
      String(process.env.EMAIL_ASSET_LOGO_URL || '').trim() ||
      'https://res.cloudinary.com/dtdfxrpsj/image/upload/v1776203667/logo_lbbxgf.svg',
    mascotDefault:
      String(process.env.EMAIL_ASSET_MASCOT_DEFAULT_URL || '').trim() ||
      'https://res.cloudinary.com/dtdfxrpsj/image/upload/v1776203669/Mido_jgov9w.svg',
    mascotComputer:
      String(process.env.EMAIL_ASSET_MASCOT_COMPUTER_URL || '').trim() ||
      'https://res.cloudinary.com/dtdfxrpsj/image/upload/v1776203668/Mido_Computer_jhfxo3.svg',
    mascotCellphone:
      String(process.env.EMAIL_ASSET_MASCOT_CELLPHONE_URL || '').trim() ||
      'https://res.cloudinary.com/dtdfxrpsj/image/upload/v1776203668/Mido_Celular_xlgbgw.svg',
    mascotCurious:
      String(process.env.EMAIL_ASSET_MASCOT_CURIOUS_URL || '').trim() ||
      'https://res.cloudinary.com/dtdfxrpsj/image/upload/v1776203669/Mido_Curioso_r1e7yh.svg',
  };
}

function getMailerConfig() {
  const optionalValue = (value) => {
    const clean = String(value || '').trim();
    if (!clean) return '';
    if (['n/a', 'na', 'none', 'null', '-'].includes(clean.toLowerCase())) return '';
    return clean;
  };

  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = optionalValue(process.env.SMTP_USER);
  const pass = optionalValue(process.env.SMTP_PASS);
  const from = String(process.env.SMTP_FROM || '').trim();

  if (!host || !port || !from) {
    return null;
  }

  return {
    host,
    port,
    user: user || null,
    pass: pass || null,
    from,
  };
}

function getTransporter() {
  const config = getMailerConfig();
  if (!config) {
    throw new Error('Serviço de email não configurado. Defina SMTP_HOST, SMTP_PORT e SMTP_FROM (e opcionalmente SMTP_USER/SMTP_PASS).');
  }

  const transportOptions = {
    host: config.host,
    port: config.port,
    secure: config.port === 465,
  };

  if (config.user && config.pass) {
    transportOptions.auth = {
      user: config.user,
      pass: config.pass,
    };
  }

  return {
    config,
    transporter: nodemailer.createTransport({
      ...transportOptions,
    }),
  };
}

function getContactRecipient() {
  const explicit = String(process.env.CONTACT_TO || '').trim();
  if (explicit) return explicit;
  return '';
}

async function sendContactEmail({
  fullName,
  subject,
  email,
  phone,
  destination,
  uf,
  city,
  message,
  meta,
}) {
  const { config, transporter } = getTransporter();

  const to = getContactRecipient();
  if (!to) {
    throw new Error('CONTACT_TO não configurado.');
  }

  const safeSubject = escapeHtml(subject);
  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone || '-');
  const safeDestination = escapeHtml(destination || '-');
  const safeUf = escapeHtml(uf || '-');
  const safeCity = escapeHtml(city || '-');
  const safeMessage = escapeHtml(message);
  const safeIp = escapeHtml(meta?.ip || '-');
  const safeUa = escapeHtml(meta?.userAgent || '-');

  const html = renderEmailLayout({
    preheader: `Nova mensagem de contato: ${subject}`,
    title: 'Fale conosco',
    subtitle: 'Nova mensagem enviada pelo formulário do Midori.',
    mascotName: 'Mido Curioso.svg',
    bodyHtml: `
      <div style="display:grid;gap:10px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#2D2D2D;"><strong>Assunto:</strong> ${safeSubject}</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#2D2D2D;"><strong>Nome:</strong> ${safeName}</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#2D2D2D;"><strong>E-mail:</strong> ${safeEmail}</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#2D2D2D;"><strong>Telefone:</strong> ${safePhone}</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#2D2D2D;"><strong>Destino:</strong> ${safeDestination}</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#2D2D2D;"><strong>UF/Cidade:</strong> ${safeUf} / ${safeCity}</p>
        <div style="margin-top:6px;padding:12px 14px;border-radius:12px;border:1px solid #E0E0E0;background:#FFFFFF;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:#2D2D2D;white-space:pre-wrap;">${safeMessage}</p>
        </div>
      </div>
    `,
    footerHtml: `
      <div style="display:grid;gap:6px;">
        <div><strong>IP:</strong> ${safeIp}</div>
        <div><strong>User-Agent:</strong> ${safeUa}</div>
      </div>
    `,
  });

  await transporter.sendMail({
    from: config.from,
    to,
    replyTo: email,
    subject: `Midori | Contato - ${subject}`,
    text:
      `Midori | Contato\n\n`
      + `Assunto: ${subject}\n`
      + `Nome: ${fullName}\n`
      + `E-mail: ${email}\n`
      + `Telefone: ${phone || '-'}\n`
      + `Destino: ${destination || '-'}\n`
      + `UF/Cidade: ${uf || '-'} / ${city || '-'}\n\n`
      + `${message}\n\n`
      + `IP: ${meta?.ip || '-'}\n`
      + `User-Agent: ${meta?.userAgent || '-'}\n`,
    html,
  });
}

function renderEmailLayout({ preheader, title, subtitle, bodyHtml, footerHtml, mascotName = 'Mido.svg' }) {
  const baseUrl = getFrontendBaseUrl();
  const brandAssets = getEmailBrandAssets();
  const logoUrl = brandAssets.logo || getAssetUrl(baseUrl, 'logo.svg');
  const headerUrl = getAssetUrl(baseUrl, 'Header.svg');
  const footerUrl = getAssetUrl(baseUrl, 'Footer.svg');
  const mascotByName = {
    'Mido.svg': brandAssets.mascotDefault,
    'Mido Computer.svg': brandAssets.mascotComputer,
    'Mido Celular.svg': brandAssets.mascotCellphone,
    'Mido Curioso.svg': brandAssets.mascotCurious,
  };
  const mascotUrl = mascotByName[mascotName] || getAssetUrl(baseUrl, mascotName) || brandAssets.mascotDefault;

  const safePreheader = escapeHtml(preheader);
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);

  return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
    </style>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>
    <div style="margin:0;padding:0;background:#ECECEC;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ECECEC;padding:20px 12px;font-family:'Poppins','Segoe UI',Arial,sans-serif;color:#2D2D2D;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#F3F5F3;border-radius:16px;overflow:hidden;border:1px solid rgba(67,95,23,0.18);">
              <tr>
                <td style="padding:0;line-height:0;">
                  ${headerUrl
                    ? `<img src="${headerUrl}" alt="" style="display:block;width:100%;height:auto;max-height:140px;object-fit:cover;" />`
                    : '<div style="height:10px;background:#B5FF3F;"></div>'}
                </td>
              </tr>
              <tr>
                <td style="padding:18px 24px 6px 24px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td valign="middle" align="left">
                        ${logoUrl
                          ? `<img src="${logoUrl}" alt="Midori" style="display:block;width:190px;height:auto;" />`
                          : '<div style="font-size:34px;font-weight:700;line-height:1;color:#435F17;">Midori</div>'}
                      </td>
                      <td valign="middle" align="right" style="width:128px;">
                        ${mascotUrl
                          ? `<img src="${mascotUrl}" alt="Mascote Midori" style="display:block;width:112px;height:auto;margin-left:auto;" />`
                          : ''}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 0 24px;">
                  <h1 style="margin:0;font-size:52px;line-height:1.05;color:#2D2D2D;font-weight:800;">${safeTitle}</h1>
                  <p style="margin:10px 0 0 0;font-size:15px;line-height:1.5;color:#6B6B6B;font-weight:500;">${safeSubtitle}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 24px 8px 24px;font-family:'Poppins','Segoe UI',Arial,sans-serif;">${bodyHtml}</td>
              </tr>
              <tr>
                <td style="padding:0 24px 24px 24px;">
                  <div style="font-size:13px;line-height:1.6;color:#6B6B6B;border-top:1px solid #E0E0E0;padding-top:14px;">
                    ${footerHtml}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0;line-height:0;">
                  ${footerUrl
                    ? `<img src="${footerUrl}" alt="" style="display:block;width:100%;height:auto;max-height:120px;object-fit:cover;" />`
                    : '<div style="height:8px;background:#435F17;"></div>'}
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
    mascotName: 'Mido Celular.svg',
    bodyHtml: `
      <p style="margin:0 0 10px 0;font-size:15px;color:#2D2D2D;">Seu código de verificação:</p>
      <div style="display:inline-block;background:#FFFFFF;border:1px solid #E0E0E0;border-radius:12px;padding:14px 18px;font-size:34px;letter-spacing:10px;font-weight:700;color:#435F17;">
        ${escapeHtml(code)}
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
    mascotName: 'Mido Computer.svg',
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
    mascotName: 'Mido Curioso.svg',
    bodyHtml: `
      <p style="margin:0;font-size:15px;line-height:1.6;color:#2D2D2D;">${escapeHtml(message)}</p>
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
  sendContactEmail,
};
