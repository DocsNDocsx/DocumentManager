jest.mock('../middleware/auth', () => (req, _res, next) => {
  req.user = { email: 'ava@example.com' };
  next();
});
jest.mock('../utils/sql', () => ({ query: jest.fn() }));
jest.mock('@vercel/blob/client', () => ({ handleUpload: jest.fn() }));

const express = require('express');
const request = require('supertest');
const pool = require('../utils/sql');
const { handleUpload } = require('@vercel/blob/client');
const submissionRoutes = require('../routes/submissionroutes');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api', submissionRoutes);
  return instance;
}

function projectRow() {
  return {
    id: 'project-1',
    status: 'active',
    deadline: new Date(Date.now() + 86400000).toISOString(),
    collaborators: JSON.stringify([{ email: 'ava@example.com' }]),
    documents: JSON.stringify([{ fileTypes: ['PDF'], maxSize: 5, sizeUnit: 'MB' }]),
  };
}

describe('private Blob client token route', () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    handleUpload.mockImplementation(async options => {
      const result = await options.onBeforeGenerateToken(
        options.body.payload.pathname,
        options.body.payload.clientPayload,
      );
      return { clientToken: 'client-token', policy: result };
    });
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  });

  it('generates a token scoped to the selected document policy', async () => {
    pool.query.mockResolvedValueOnce([[projectRow()]]);

    const response = await request(app())
      .post('/api/projects/project-1/submissions/upload-token')
      .send({
        type: 'blob.generate-client-token',
        payload: {
          pathname: 'submissions/solo/project-1/0/doc-0-resume.pdf',
          clientPayload: JSON.stringify({ collabIndex: 0, docIndex: 0 }),
          multipart: true,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.policy).toEqual({
      allowedContentTypes: ['application/pdf'],
      maximumSizeInBytes: 5 * 1024 * 1024,
      addRandomSuffix: true,
    });
    expect(handleUpload.mock.calls[0][0].token).toBe('vercel_blob_rw_test');
  });

  it('rejects a token request for another collaborator slot', async () => {
    pool.query.mockResolvedValueOnce([[projectRow()]]);

    const response = await request(app())
      .post('/api/projects/project-1/submissions/upload-token')
      .send({
        type: 'blob.generate-client-token',
        payload: {
          pathname: 'submissions/solo/project-1/1/doc-0-resume.pdf',
          clientPayload: JSON.stringify({ collabIndex: 1, docIndex: 0 }),
          multipart: true,
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid collaborator');
  });

  it('does not allow the project owner to upload for another collaborator', async () => {
    pool.query.mockResolvedValueOnce([[{ ...projectRow(), user_id: 'owner-1', collaborators: JSON.stringify([{ email: 'bob@example.com' }]) }]]);

    const response = await request(app())
      .post('/api/projects/project-1/submissions/upload-token')
      .send({
        type: 'blob.generate-client-token',
        payload: {
          pathname: 'submissions/solo/project-1/0/doc-0-resume.pdf',
          clientPayload: JSON.stringify({ collabIndex: 0, docIndex: 0 }),
          multipart: true,
        },
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('You are not authorized to upload for this collaborator.');
  });

  it('returns a service error when private Blob is not configured', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const response = await request(app())
      .post('/api/projects/project-1/submissions/upload-token')
      .send({ type: 'blob.generate-client-token', payload: {} });

    expect(response.status).toBe(503);
    expect(response.body.message).toContain('Secure file storage');
    expect(handleUpload).not.toHaveBeenCalled();
  });
});
