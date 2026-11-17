import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewHistoryQueryDto } from '../../../src/ai-review/dto/review-history-query.dto.js';

const toDto = (query: Record<string, unknown>) => plainToInstance(ReviewHistoryQueryDto, query);

describe('ReviewHistoryQueryDto', () => {
  it('is valid without params', async () => {
    await expect(validate(toDto({}))).resolves.toHaveLength(0);
  });

  it('converts limit from a query string to a number', async () => {
    const dto = toDto({ limit: '10', cursor: 'abc' });

    expect(dto.limit).toBe(10);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['0', '51', '2.5', 'abc'])('rejects limit=%s', async (limit) => {
    const errors = await validate(toDto({ limit }));

    expect(errors.map((e) => e.property)).toEqual(['limit']);
  });
});
