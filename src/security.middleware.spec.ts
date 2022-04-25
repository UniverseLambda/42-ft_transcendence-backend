import { SecurityMiddleware } from './security.middleware';

describe('SecurityMiddleware', () => {
  it('should be defined', () => {
    expect(new SecurityMiddleware()).toBeDefined();
  });
});
