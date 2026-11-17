import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RefreshTokenDto } from '../../../src/auth/dto/refresh-token.dto.js';

const validateDto = (body: Record<string, unknown>) =>
  validate(plainToInstance(RefreshTokenDto, body));

describe('RefreshTokenDto', () => {
  it('accepts a long enough string', async () => {
    await expect(validateDto({ refreshToken: 'x'.repeat(20) })).resolves.toHaveLength(0);
  });

  it.each([
    ['missing', {}],
    ['too short', { refreshToken: 'short' }],
    ['not a string', { refreshToken: 12345678901234567890 }],
  ])('rejects %s refreshToken', async (_case, body) => {
    const errors = await validateDto(body);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('refreshToken');
  });
});
