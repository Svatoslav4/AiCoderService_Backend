import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from '../../../src/users/dto/create-user.dto.js';

const validateDto = (body: Record<string, unknown>) =>
  validate(plainToInstance(CreateUserDto, body));

describe('CreateUserDto', () => {
  it('accepts email with optional username', async () => {
    await expect(validateDto({ email: 'a@b.co' })).resolves.toHaveLength(0);
    await expect(validateDto({ email: 'a@b.co', username: 'abc' })).resolves.toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const errors = await validateDto({ email: 'not-an-email' });

    expect(errors.map((e) => e.property)).toEqual(['email']);
  });

  it('rejects a username shorter than 3 chars', async () => {
    const errors = await validateDto({ email: 'a@b.co', username: 'ab' });

    expect(errors.map((e) => e.property)).toEqual(['username']);
  });
});
