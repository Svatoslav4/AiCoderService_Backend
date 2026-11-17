import { Logger } from '@nestjs/common';

// Сервіси логують очікувані помилки (невалідна відповідь Gemini тощо) — у тестах це лише шум
Logger.overrideLogger(false);
