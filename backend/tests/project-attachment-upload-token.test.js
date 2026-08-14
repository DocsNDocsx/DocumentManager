jest.mock('../middleware/auth', () => (req, _res, next) => {
  req.user = { email: 'owner@example.com' };
  next();
});
jest.mock('../middleware/subscription', () => (_req, _res, next) => next());
jest.mock('../controllers/projectcontroller', () => ({
  uploadProjectAttachment: jest.fn(),
  createProject: jest.fn(),
  getProjects: jest.fn(),
  getProject: jest.fn(),
  validateActivation: jest.fn(),
  activateProject: jest.fn(),
  cancelProject: jest.fn(),
  discardPendingUpgrade: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
}));
jest.mock('@vercel/blob/client', () => ({ handleUpload: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { handleUpload } = require('@vercel/blob/client');
const projectRoutes = require('../routes/projectroutes');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api', projectRoutes);
  return instance;
}

describe('project attachment client upload token route', () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = 'storage-token';
    handleUpload.mockImplementation(async options => ({
      clientToken: 'client-token',
      policy: await options.onBeforeGenerateToken(
        options.body.payload.pathname,
        options.body.payload.clientPayload,
      ),
    }));
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  });

  it('allows a 50 MB public project attachment upload', async () => {
    const response = await request(app())
      .post('/api/project-attachments/upload-token')
      .send({
        type: 'blob.generate-client-token',
        payload: {
          pathname: 'project-attachments/solo/upload-id-brief.pdf',
          clientPayload: JSON.stringify({ scope: 'solo' }),
          multipart: true,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.policy).toEqual({
      maximumSizeInBytes: 50 * 1024 * 1024,
      addRandomSuffix: true,
    });
  });

  it('rejects unsupported attachment types', async () => {
    const response = await request(app())
      .post('/api/project-attachments/upload-token')
      .send({
        type: 'blob.generate-client-token',
        payload: {
          pathname: 'project-attachments/solo/upload-id-script.exe',
          clientPayload: JSON.stringify({ scope: 'solo' }),
          multipart: true,
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('File type not allowed');
  });
});
