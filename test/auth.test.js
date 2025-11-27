const request = require('supertest');

// Mock the supabase client
jest.mock('../src/config/supabase', () => {
  return {
    auth: {
      signUp: jest.fn(async ({ email }) => ({ data: { user: { id: 'sup-123', email } }, error: null })),
      signInWithPassword: jest.fn(async ({ email }) => ({ data: { user: { id: 'sup-123', email }, session: { access_token: 'token-abc' } }, error: null })),
      signInWithOAuth: jest.fn(async () => ({ data: { url: 'https://example.com/oauth' }, error: null })),
      getUser: jest.fn(async (token) => ({ data: { user: { id: 'sup-123', email: 'a@b.com' } }, error: null })),
    },
  };
});

// Mock the User model to prevent DB access
jest.mock('../src/models/User', () => {
  return {
    findOneAndUpdate: jest.fn(async () => ({ supabaseId: 'sup-123', email: 'a@b.com' })),
  };
});

const app = require('../src/app');

describe('Auth routes', () => {
  test('POST /auth/signup should return ok', async () => {
    const res = await request(app).post('/auth/signup').send({ email: 'a@b.com', password: 'secret123' });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  test('POST /auth/signin should return ok and set session cookie', async () => {
    const res = await request(app).post('/auth/signin').send({ email: 'a@b.com', password: 'secret123' });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    // supertest exposes cookies in header
    const cookies = res.headers['set-cookie'] || [];
    // cookie-session sets a cookie named 'session'
    const hasSession = cookies.some(c => c.includes('session='));
    expect(hasSession).toBe(true);
  });

  test('GET /auth/oauth/google returns oauth url', async () => {
    const res = await request(app).get('/auth/oauth/google');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.url).toBeDefined();
  });
});
