jest.mock('../utils/sql', () => ({
  query: jest.fn(),
}));

const pool = require('../utils/sql');
const cardsController = require('../controllers/cardscontroller');

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('cardscontroller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gets and formats cards', async () => {
    pool.query.mockResolvedValueOnce([[{
      id: 7,
      last4: '4242',
      card_type: 'visa',
      card_holder: 'MRIDUL MISHRA',
      expiry_month: 8,
      expiry_year: 2029,
      is_default: true,
    }]]);
    const res = mockResponse();

    await cardsController.getCards({ query: { userid: '123', type: 'solo' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      cards: [{
        id: 7,
        number: '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 4242',
        name: 'MRIDUL MISHRA',
        expiry: '08/29',
        type: 'visa',
        isDefault: true,
      }],
    });
  });

  it('requires userid when listing cards', async () => {
    const res = mockResponse();

    await cardsController.getCards({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'userid is required' });
  });

  it('adds a default card and uppercases the holder name', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ insertId: 11 }])
      .mockResolvedValueOnce([[{
        id: 11,
        last4: '1111',
        card_type: 'mastercard',
        card_holder: 'NEW USER',
        expiry_month: 12,
        expiry_year: 2030,
        is_default: true,
      }]]);
    const res = mockResponse();

    await cardsController.addCard({
      body: {
        userid: '123',
        last4: '1111',
        card_type: 'mastercard',
        card_holder: 'New User',
        expiry_month: 12,
        expiry_year: 2030,
        is_default: true,
      },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'UPDATE payment_cards SET is_default = false WHERE userid = ? AND type = ?',
      ['123', 'solo'],
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      card: expect.objectContaining({ name: 'NEW USER', expiry: '12/30' }),
    }));
  });

  it('requires fields when adding a card', async () => {
    const res = mockResponse();

    await cardsController.addCard({ body: { userid: '123' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Missing required fields' });
  });

  it('sets a default card', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 1 }]);
    const res = mockResponse();

    await cardsController.setDefault({ params: { id: '7' }, body: { userid: '123' } }, res);

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('requires userid when setting default card', async () => {
    const res = mockResponse();

    await cardsController.setDefault({ params: { id: '7' }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'userid is required' });
  });

  it('deletes a card', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await cardsController.deleteCard({ params: { id: '7' }, query: { userid: '123' } }, res);

    expect(pool.query).toHaveBeenCalledWith('DELETE FROM payment_cards WHERE id = ? AND userid = ?', ['7', '123']);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 500 when deleting fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    pool.query.mockRejectedValueOnce(new Error('db failed'));
    const res = mockResponse();

    await cardsController.deleteCard({ params: { id: '7' }, query: { userid: '123' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Internal server error' });
    console.error.mockRestore();
  });
});
