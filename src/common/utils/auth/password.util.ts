import bcrypt from 'bcryptjs';
import { env } from '../../configs/env';

export const PasswordUtil = {
  /**
   * So sánh mật khẩu gốc với mã băm bcrypt.
   */
  compare: async (plainPassword?: string, hash?: string): Promise<boolean> => {
    if (!plainPassword || !hash) return false;
    return bcrypt.compare(plainPassword, hash);
  },

  /**
   * Băm mật khẩu nếu nó chưa được băm.
   * Nhận diện mã băm bcrypt qua tiền tố $2a$, $2b$, $2y$.
   */
  hashIfNeeded: async (password: string): Promise<string> => {
    if (
      !password ||
      typeof password !== 'string' ||
      password.startsWith('$2a$') ||
      password.startsWith('$2b$') ||
      password.startsWith('$2y$')
    ) {
      // Đã được băm hoặc đầu vào không hợp lệ
      return password;
    }

    // Gọi thẳng env.BCRYPT_SALT_ROUNDS (Zod đã đảm bảo đây chắc chắn là một con số >= 1)
    return bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  },
};
