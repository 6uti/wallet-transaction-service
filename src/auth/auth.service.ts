import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';

const MOCK_USERS: Record<string, { password: string; userId: string }> = {
  'senior.backend': { password: 'Password123', userId: 'usr_system' },
};

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  login(dto: LoginDto): { token: string; expiresIn: number } {
    const user = MOCK_USERS[dto.username];

    if (!user || user.password !== dto.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // parseInt garantiza que sea número aunque la env var llegue como string
    const expiresIn = parseInt(
      this.configService.get<string>('JWT_EXPIRES_IN', '3600'),
      10,
    );

    const token = this.jwtService.sign(
      { sub: user.userId, username: dto.username },
      { expiresIn },  // pasarlo explícitamente al sign()
    );

    return { token, expiresIn };
  }
}
