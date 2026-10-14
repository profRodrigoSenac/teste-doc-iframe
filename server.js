const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PORT = 3000;

const DEFAULT_VOCABULARY = [
  {
    id: "numero_processo",
    label: "Número do processo judicial",
    value: "0001234-56.2024.8.26.0100",
    icon: "bi-hash",
    description: "Número único CNJ do processo"
  },
  {
    id: "reus",
    label: "Réus",
    value: "Banco Alpha S.A. e Seguradora Beta Ltda.",
    icon: "bi-shield-shaded",
    description: "Parte demandada (polo passivo)"
  },
  {
    id: "autores",
    label: "Autores",
    value: "Carlos Alberto da Silva e Maria Fernandes Silva",
    icon: "bi-people-fill",
    description: "Parte requerente (polo ativo)"
  },
  {
    id: "juizo",
    label: "Juízo",
    value: "4ª Vara Cível do Foro Central da Comarca de São Paulo/SP",
    icon: "bi-bank",
    description: "Vara e comarca competente"
  },
  {
    id: "valor_causa",
    label: "Valor da causa",
    value: "R$ 75.000,00 (setenta e cinco mil reais)",
    icon: "bi-currency-dollar",
    description: "Valor atribuído à causa com extenso"
  }
];

const CUSTOM_WORDS = [
  "Juiz Fulano",
  "Réu jose",
  "R$ 12.500,02",
  "20/12/2024"
];

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

const MODELS_DIR = path.join(__dirname, 'modelos');
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR);
}

const CONFIG_PATH = path.join(__dirname, 'app.config.json');

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('Erro ao ler config:', error);
  }
  return { parentFolderId: '', documents: [] };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Erro ao salvar config:', error);
  }
}

// ----------------------------------------------------
// Autenticação com o Google via credentials.json (Sistema)
// ----------------------------------------------------
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
let credentials = null;
try {
  if (fs.existsSync(CREDENTIALS_PATH)) {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    credentials = JSON.parse(content);
  }
} catch (error) {
  console.error('Erro ao carregar credentials.json:', error);
}

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive'
];

let authClient = null;
let oauth2Client = null;
let isServiceAccount = false;

if (credentials) {
  if (credentials.type === 'service_account') {
    // 1. Conta de Serviço do Google Cloud
    isServiceAccount = true;
    authClient = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: SCOPES
    });
    console.log(`[AUTH] Sistema configurado com Conta de Serviço: ${credentials.client_email}`);
  } else if (credentials.web || credentials.installed) {
    // 2. Credenciais OAuth 2.0 (Web / App) com token persistente de sistema
    const keys = credentials.web || credentials.installed;
    const redirectUri = keys.redirect_uris ? keys.redirect_uris[0] : 'http://localhost:3000/oauth2callback';
    oauth2Client = new google.auth.OAuth2(
      keys.client_id,
      keys.client_secret,
      redirectUri
    );

    oauth2Client.on('tokens', (tokens) => {
      const config = getConfig();
      if (config.tokens && config.tokens.refresh_token && !tokens.refresh_token) {
        tokens.refresh_token = config.tokens.refresh_token;
      }
      config.tokens = { ...(config.tokens || {}), ...tokens };
      saveConfig(config);
      console.log('[AUTH] Tokens atualizados e salvos no config.');
    });

    const savedConfig = getConfig();
    if (savedConfig.tokens) {
      oauth2Client.setCredentials(savedConfig.tokens);
      console.log('[AUTH] Sessão do sistema restaurada a partir do app.config.json.');
    }
    authClient = oauth2Client;
  } else {
    console.warn('[AUTH] Formato do credentials.json não reconhecido (esperado "service_account" ou "web/installed").');
  }
} else {
  console.warn('[AUTH] Arquivo credentials.json não encontrado na raiz do projeto.');
}

function getDriveClient() {
  if (!authClient) {
    throw new Error('Autenticação do sistema não configurada. Verifique o arquivo credentials.json.');
  }
  return google.drive({ version: 'v3', auth: authClient });
}

// ----------------------------------------------------
// Servir Frontend SPA
// ----------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ----------------------------------------------------
// Rotas da API (Operações do Sistema no Google Drive)
// ----------------------------------------------------

app.get('/api/documents', async (req, res) => {
  const config = getConfig();
  let configChanged = false;

  try {
    const drive = getDriveClient();
    const documents = await Promise.all((config.documents || []).map(async (docItem, index) => {
      const docId = typeof docItem === 'string' ? docItem : docItem.id;
      const storedName = typeof docItem === 'string' ? null : docItem.name;
      try {
        const file = await drive.files.get({
          fileId: docId,
          fields: 'id, name',
          supportsAllDrives: true
        });
        if (typeof docItem === 'string' || docItem.name !== file.data.name) {
          config.documents[index] = { id: file.data.id, name: file.data.name };
          configChanged = true;
        }
        return { id: file.data.id, title: file.data.name };
      } catch (e) {
        console.error(`Erro ao buscar documento ${docId}:`, e.message);
        return { id: docId, title: storedName || 'Documento Indisponível' };
      }
    }));

    if (configChanged) saveConfig(config);
    res.json({ success: true, documents });
  } catch (error) {
    console.error('Erro ao listar documentos:', error.message);
    res.status(500).json({ success: false, message: 'Erro ao listar documentos: ' + error.message });
  }
});

app.get('/api/keywords', (req, res) => {
  const config = getConfig();
  if (!config.legalVocabulary || !Array.isArray(config.legalVocabulary) || config.legalVocabulary.length === 0) {
    config.legalVocabulary = DEFAULT_VOCABULARY;
    saveConfig(config);
  }
  res.json({ success: true, keywords: config.legalVocabulary });
});

app.post('/api/keywords', (req, res) => {
  const { keywords } = req.body;
  if (!keywords || !Array.isArray(keywords)) {
    return res.status(400).json({ success: false, message: 'Formato de palavras-chave inválido.' });
  }
  const config = getConfig();
  config.legalVocabulary = keywords;
  saveConfig(config);
  res.json({ success: true, message: 'Palavras-chave atualizadas com sucesso.', keywords: config.legalVocabulary });
});

async function getDocumentSharingInfo(drive, fileId, targetDomain) {
  try {
    const res = await drive.permissions.list({
      fileId: fileId,
      fields: 'permissions(id, type, role, domain)',
      supportsAllDrives: true
    });
    const permissions = res.data.permissions || [];
    const hasAnyone = permissions.some(p => p.type === 'anyone');
    const hasDomain = permissions.some(p => p.type === 'domain' && (!targetDomain || p.domain === targetDomain));
    
    let currentMode = 'restricted';
    if (hasAnyone) {
      currentMode = 'public';
    } else if (hasDomain) {
      currentMode = 'domain';
    }
    return {
      mode: currentMode,
      targetDomain: targetDomain || 'procuradoria.rio',
      permissions: permissions
    };
  } catch (error) {
    console.error(`Erro ao consultar permissões de ${fileId}:`, error.message);
    return { mode: 'unknown', targetDomain: targetDomain || 'procuradoria.rio', permissions: [], error: error.message };
  }
}

async function setDocumentSharingMode(drive, fileId, mode, targetDomain = 'procuradoria.rio') {
  try {
    const res = await drive.permissions.list({
      fileId: fileId,
      fields: 'permissions(id, type, role, domain)',
      supportsAllDrives: true
    });
    const permissions = res.data.permissions || [];

    if (mode === 'public') {
      for (const p of permissions) {
        if (p.type === 'domain') {
          try {
            await drive.permissions.delete({
              fileId: fileId,
              permissionId: p.id,
              supportsAllDrives: true
            });
          } catch (e) {
            console.warn(`Aviso ao remover permissão de domínio ${p.id}:`, e.message);
          }
        }
      }
      const hasAnyone = permissions.find(p => p.type === 'anyone');
      if (!hasAnyone) {
        await drive.permissions.create({
          fileId: fileId,
          supportsAllDrives: true,
          requestBody: {
            role: 'writer',
            type: 'anyone'
          }
        });
      }
      console.log(`Documento ${fileId} configurado para modo PÚBLICO.`);
    } else if (mode === 'domain' || mode === 'private') {
      for (const p of permissions) {
        if (p.type === 'anyone') {
          try {
            await drive.permissions.delete({
              fileId: fileId,
              permissionId: p.id,
              supportsAllDrives: true
            });
          } catch (e) {
            console.warn(`Aviso ao remover permissão pública ${p.id}:`, e.message);
          }
        }
      }
      if (targetDomain) {
        const hasDomain = permissions.find(p => p.type === 'domain' && p.domain === targetDomain);
        if (!hasDomain) {
          await drive.permissions.create({
            fileId: fileId,
            supportsAllDrives: true,
            requestBody: {
              role: 'writer',
              type: 'domain',
              domain: targetDomain
            }
          });
        }
      }
      console.log(`Documento ${fileId} configurado para modo PRIVADO (Domínio: ${targetDomain}).`);
    } else if (mode === 'restricted') {
      for (const p of permissions) {
        if (p.type === 'anyone' || p.type === 'domain') {
          try {
            await drive.permissions.delete({
              fileId: fileId,
              permissionId: p.id,
              supportsAllDrives: true
            });
          } catch (e) {
            console.warn(`Aviso ao remover permissão ${p.id}:`, e.message);
          }
        }
      }
      console.log(`Documento ${fileId} configurado para modo RESTRITO.`);
    }
    return { success: true, mode, targetDomain };
  } catch (error) {
    console.error(`Erro ao definir permissão (${mode}) para ${fileId}:`, error.message);
    throw error;
  }
}

// Rotas de configuração de compartilhamento
app.get('/api/settings/sharing', (req, res) => {
  const config = getConfig();
  res.json({
    success: true,
    defaultMode: config.defaultSharingMode || 'domain',
    targetDomain: config.workspaceDomain || 'procuradoria.rio'
  });
});

app.post('/api/settings/sharing', (req, res) => {
  const { defaultMode, targetDomain } = req.body;
  const config = getConfig();
  if (defaultMode) config.defaultSharingMode = defaultMode;
  if (targetDomain) config.workspaceDomain = targetDomain.trim();
  saveConfig(config);
  res.json({
    success: true,
    message: 'Configurações de compartilhamento atualizadas.',
    defaultMode: config.defaultSharingMode,
    targetDomain: config.workspaceDomain
  });
});

// Consulta a permissão atual de um documento
app.get('/api/document/:id/permissions', async (req, res) => {
  const config = getConfig();
  const fileId = req.params.id;
  const targetDomain = config.workspaceDomain || 'procuradoria.rio';

  try {
    const drive = getDriveClient();
    const info = await getDocumentSharingInfo(drive, fileId, targetDomain);
    res.json({
      success: true,
      docId: fileId,
      mode: info.mode,
      targetDomain: info.targetDomain
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao consultar permissões do documento: ' + error.message });
  }
});

// Altera a permissão de um documento específico
app.post('/api/document/:id/permissions', async (req, res) => {
  const config = getConfig();
  const fileId = req.params.id;
  const { mode, targetDomain } = req.body;
  const domain = (targetDomain && targetDomain.trim()) || config.workspaceDomain || 'procuradoria.rio';
  const selectedMode = mode || config.defaultSharingMode || 'domain';

  try {
    const drive = getDriveClient();
    const result = await setDocumentSharingMode(drive, fileId, selectedMode, domain);
    res.json({
      success: true,
      message: `Permissão do documento alterada para ${selectedMode === 'public' ? 'Público' : 'Privado (' + domain + ')'}.`,
      docId: fileId,
      mode: selectedMode,
      targetDomain: domain
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao atualizar permissão do documento: ' + error.message });
  }
});

// Criação de documento pelo sistema
app.post('/api/document', async (req, res) => {
  const config = getConfig();
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fileName = (req.body && req.body.docName && req.body.docName.trim())
    || `minuta ${stamp}`;

  const sharingMode = (req.body && req.body.sharingMode) || config.defaultSharingMode || 'domain';
  const targetDomain = (req.body && req.body.targetDomain) || config.workspaceDomain || 'procuradoria.rio';

  try {
    const drive = getDriveClient();
    let file;
    if (config.docDefault && config.docDefault.id) {
      file = await drive.files.copy({
        fileId: config.docDefault.id,
        supportsAllDrives: true,
        resource: {
          name: fileName,
          parents: config.parentFolderId ? [config.parentFolderId] : []
        },
        fields: 'id, name'
      });
    } else {
      file = await drive.files.create({
        supportsAllDrives: true,
        resource: {
          name: fileName,
          mimeType: 'application/vnd.google-apps.document',
          parents: config.parentFolderId ? [config.parentFolderId] : []
        },
        fields: 'id, name'
      });
    }

    try {
      await setDocumentSharingMode(drive, file.data.id, sharingMode, targetDomain);
    } catch (permErr) {
      console.warn('Aviso ao aplicar permissões na criação:', permErr.message);
    }

    if (!config.documents) config.documents = [];
    config.documents.push({ id: file.data.id, name: file.data.name });
    saveConfig(config);
    res.json({
      success: true,
      document: { id: file.data.id, title: file.data.name },
      sharingMode: sharingMode,
      targetDomain: targetDomain
    });
  } catch (error) {
    console.error('Erro ao criar arquivo no Drive:', error);
    res.status(500).json({ success: false, message: 'Erro ao criar documento: ' + error.message });
  }
});

// Exclusão de documento pelo sistema
app.delete('/api/document/:id', async (req, res) => {
  const config = getConfig();
  const fileId = req.params.id;

  try {
    const drive = getDriveClient();
    try {
      await drive.files.delete({
        fileId: fileId,
        supportsAllDrives: true
      });
    } catch (e) {
      console.warn(`Aviso ao excluir do Drive ${fileId}:`, e.message);
    }

    config.documents = (config.documents || []).filter(doc => {
      const id = typeof doc === 'string' ? doc : doc.id;
      return id !== fileId;
    });
    saveConfig(config);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir arquivo:', error);
    res.status(500).json({ success: false, message: 'Erro ao excluir documento: ' + error.message });
  }
});

// Atualização de título
app.post('/api/document/:id/title', async (req, res) => {
  const docId = req.params.id;
  const { title } = req.body;

  if (!title || title.trim() === '') {
    return res.status(400).json({ success: false, message: 'O título não pode ser vazio.' });
  }

  try {
    const drive = getDriveClient();
    await drive.files.update({
      fileId: docId,
      supportsAllDrives: true,
      resource: {
        name: title.trim()
      }
    });

    const config = getConfig();
    const docIndex = config.documents.findIndex(doc => (typeof doc === 'string' ? doc : doc.id) === docId);
    if (docIndex !== -1) {
      config.documents[docIndex].name = title.trim();
      saveConfig(config);
    }

    res.json({ success: true, message: 'Título atualizado com sucesso.' });
  } catch (error) {
    console.error('Erro ao atualizar o título do documento:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar o título: ' + error.message });
  }
});

// Aplicação de modelo HTML
app.post('/apply-template/:id', async (req, res) => {
  const docId = req.params.id;
  const { templateName } = req.body;
  const templatePath = path.join(MODELS_DIR, templateName);

  if (!templatePath.startsWith(MODELS_DIR) || !fs.existsSync(templatePath)) {
    return res.status(404).send('Modelo não encontrado.');
  }

  try {
    const drive = getDriveClient();
    await drive.files.update({
      fileId: docId,
      supportsAllDrives: true,
      media: {
        mimeType: 'text/html',
        body: fs.createReadStream(templatePath)
      }
    });
    res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao aplicar modelo:', error);
    res.status(500).send('Erro ao atualizar documento: ' + error.message);
  }
});

// Download de PDF
app.get('/download/pdf', async (req, res) => {
  const docId = req.query.docId;
  if (!docId) {
    return res.status(400).json({ success: false, message: 'Document ID é obrigatório.' });
  }

  const fileName = `${docId}-${Date.now()}.pdf`;
  const destPath = path.join(TEMP_DIR, fileName);

  try {
    const drive = getDriveClient();
    const dest = fs.createWriteStream(destPath);
    const response = await drive.files.export({
      fileId: docId,
      mimeType: 'application/pdf'
    }, { responseType: 'stream' });

    response.data
      .on('end', () => {
        console.log(`PDF salvo em ${destPath}`);
        res.json({
          success: true,
          message: 'PDF gerado com sucesso!',
          filename: fileName,
          downloadUrl: `/download/file/${fileName}`
        });
      })
      .on('error', err => {
        console.error('Erro no stream:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar stream do PDF.' });
      })
      .pipe(dest);
  } catch (error) {
    console.error('Erro na API ao exportar PDF:', error);
    res.status(500).json({ success: false, message: 'Erro ao exportar PDF: ' + error.message });
  }
});

app.get('/download/file/:filename', (req, res) => {
  const filePath = path.join(TEMP_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('Arquivo não encontrado.');
  }
});

app.get('/download/:id', async (req, res) => {
  const docId = req.params.id;
  const fileName = `${docId}-${Date.now()}.pdf`;
  const destPath = path.join(TEMP_DIR, fileName);

  try {
    const drive = getDriveClient();
    const dest = fs.createWriteStream(destPath);
    const response = await drive.files.export({
      fileId: docId,
      mimeType: 'application/pdf'
    }, { responseType: 'stream' });

    response.data
      .on('end', () => {
        console.log(`PDF salvo em ${destPath}`);
        res.download(destPath, fileName, (err) => {
          if (err) {
            console.error('Erro ao enviar o arquivo:', err);
          }
        });
      })
      .on('error', err => {
        console.error('Erro no stream:', err);
        res.status(500).send('Erro ao baixar arquivo.');
      })
      .pipe(dest);
  } catch (error) {
    console.error('Erro na API:', error);
    res.status(500).send('Erro ao exportar PDF: ' + error.message);
  }
});

// ----------------------------------------------------
// Rotas Legadas / Formulário HTML direto
// ----------------------------------------------------
app.post('/create', async (req, res) => {
  const config = getConfig();
  const { docName } = req.body;

  if (!docName || docName.trim() === '') {
    return res.status(400).send('O nome do documento não pode ser vazio.');
  }

  try {
    const drive = getDriveClient();
    let file;
    const fileName = docName.trim();

    if (config.docDefault && config.docDefault.id) {
      file = await drive.files.copy({
        fileId: config.docDefault.id,
        supportsAllDrives: true,
        resource: {
          name: fileName,
          parents: config.parentFolderId ? [config.parentFolderId] : []
        },
        fields: 'id, name'
      });
    } else {
      file = await drive.files.create({
        supportsAllDrives: true,
        resource: {
          name: fileName,
          mimeType: 'application/vnd.google-apps.document',
          parents: config.parentFolderId ? [config.parentFolderId] : []
        },
        fields: 'id, name'
      });
    }

    try {
      await setDocumentSharingMode(drive, file.data.id, config.defaultSharingMode || 'domain', config.workspaceDomain || 'procuradoria.rio');
    } catch (permErr) {
      console.warn('Aviso ao aplicar permissões na criação:', permErr.message);
    }

    config.documents.push({ id: file.data.id, name: file.data.name });
    saveConfig(config);
    res.redirect('/');
  } catch (error) {
    console.error('Erro ao criar arquivo:', error);
    res.status(500).send('Erro ao criar documento: ' + error.message);
  }
});

app.post('/delete/:id', async (req, res) => {
  const config = getConfig();
  const fileId = req.params.id;

  try {
    const drive = getDriveClient();
    await drive.files.delete({
      fileId: fileId,
      supportsAllDrives: true
    });

    config.documents = config.documents.filter(doc => {
      const id = typeof doc === 'string' ? doc : doc.id;
      return id !== fileId;
    });
    saveConfig(config);
    res.redirect('/');
  } catch (error) {
    console.error('Erro ao excluir arquivo:', error);
    res.status(500).send('Erro ao excluir documento: ' + error.message);
  }
});

// ----------------------------------------------------
// Rotas OAuth Opcionais (Caso seja usado OAuth Web Client ID)
// ----------------------------------------------------
app.get('/auth', (req, res) => {
  if (!oauth2Client) {
    return res.status(400).send('OAuth2 não configurado. Se estiver usando Service Account, a autenticação é automática via credentials.json.');
  }
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {
  if (!oauth2Client) {
    return res.status(400).send('OAuth2 não configurado.');
  }
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const config = getConfig();
    config.tokens = tokens;
    saveConfig(config);
    res.redirect('/');
  } catch (error) {
    console.error('Erro ao obter tokens:', error);
    res.status(500).send('Falha na autenticação.');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
