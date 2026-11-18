import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsString } from 'class-validator';

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

  it('rejects unexpected properties', async () => {
    await expect(
      pipe.transform(
        { name: 'LivingSpace', secret: 'nope' },
        { type: 'body', metatype: SampleDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
