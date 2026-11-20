import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsString } from 'class-validator';
import { ListServicesQueryDto } from '../../service-directory/dto/list-services-query.dto.js';

class SampleDto {
  @IsString()
  name!: string;
}

describe('ValidationPipe configuration', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it('transforms and keeps known properties', async () => {
    const value = await pipe.transform(
      { name: 'LivingSpace' },
      { type: 'body', metatype: SampleDto },
    );

    expect(value).toBeInstanceOf(SampleDto);
    expect(value).toEqual({ name: 'LivingSpace' });
  });

  it('does not treat the query string false as true', async () => {
    const strictPipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    });
    const value = await strictPipe.transform(
      { active: 'false', page: '2' },
      { type: 'query', metatype: ListServicesQueryDto },
    );
    expect(value.active).toBe(false);
    expect(value.page).toBe(2);
  });

  it('rejects unexpected properties', async () => {
    await expect(
      pipe.transform(
        { name: 'LivingSpace', secret: 'nope' },
        { type: 'body', metatype: SampleDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
