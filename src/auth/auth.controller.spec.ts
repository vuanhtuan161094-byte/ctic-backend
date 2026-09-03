import { Test, TestingModule } from '@nestjs/testing';
import { SecurityAuditService } from '../security/security-audit.service';
import { SecurityRateLimitService } from '../security/security-rate-limit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(),
            register: jest.fn(),
          },
        },
        {
          provide: SecurityAuditService,
          useValue: {
            write: jest.fn(),
          },
        },
        {
          provide: SecurityRateLimitService,
          useValue: {
            consume: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
  it('returns effective roles and permissions for the authenticated account context', () => {
    const result = controller.currentAccess({
      user: {
        userId: 'user-1',
        username: 'reviewer',
        email: 'reviewer@example.com',
        roles: ['TECHNICAL_REVIEWER'],
        permissions: ['projects.read', 'technical_reviews.perform'],
      },
    } as any);

    expect(result).toEqual({
      user: {
        id: 'user-1',
        username: 'reviewer',
        email: 'reviewer@example.com',
        roles: ['TECHNICAL_REVIEWER'],
        permissions: ['projects.read', 'technical_reviews.perform'],
      },
    });
  });

});
