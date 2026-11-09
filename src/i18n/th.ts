// Thai UI strings. Missing keys fall back to English. Needs a native-speaker review before release.
import type { MessageKey } from './en';

export const th: Partial<Record<MessageKey, string>> = {
  'app.name': 'JorGu',

  'apps.dashboard': 'หน้าหลัก',
  'apps.map': 'แผนที่',
  'apps.youtube': 'YouTube',
  'apps.web': 'เว็บ',

  'pane.change': 'เปลี่ยน',
  'pane.fullscreen': 'เต็มจอ',
  'pane.left': 'จอซ้าย',
  'pane.right': 'จอขวา',
  'pane.dragToSwap': 'ลากไปวางบนอีกจอเพื่อสลับ',
  'pane.showHeader': 'แสดงปุ่มควบคุมจอ',

  'dock.label': 'แถบเมนู',
  'dock.home': 'หน้าหลัก',
  'dock.swap': 'สลับจอ',
  'dock.split': 'สองจอ',
  'dock.single': 'จอเดียว',
  'dock.settings': 'ตั้งค่า',

  'divider.label': 'ปรับขนาดจอ',

  'fs.exit': 'ออกจากเต็มจอ',
  'fs.switch': 'สลับแอป',
  'fs.picker': 'เลือกแอป',
  'fs.showControls': 'แสดงปุ่มควบคุม',

  'picker.title': 'เลือกแอปสำหรับ{side}',
  'picker.titleFullscreen': 'เลือกแอปที่จะแสดงเต็มจอ',
  'picker.bookmarks': 'บุ๊กมาร์ก',
  'picker.current': 'กำลังแสดง',

  'sheet.close': 'ปิด',

  'settings.title': 'ตั้งค่า',
  'settings.language': 'ภาษา',
  'settings.languageEn': 'English',
  'settings.languageTh': 'ไทย',
  'settings.theme': 'ธีม',
  'settings.driverSide': 'ฝั่งคนขับ',
  'settings.driverRight': 'ขวา (ประเทศไทย)',
  'settings.driverLeft': 'ซ้าย',
  'settings.nightMode': 'โหมดกลางคืน',
  'settings.nightAuto': 'อัตโนมัติตามเวลา',
  'settings.nightOff': 'ปิด',
  'settings.nightStart': 'เริ่ม',
  'settings.nightEnd': 'สิ้นสุด',
  'settings.miniPlayer': 'ขนาดจอ YouTube ย่อ',
  'settings.reset': 'รีเซ็ตการตั้งค่า',
  'settings.resetConfirm': 'แตะอีกครั้งเพื่อรีเซ็ตทั้งหมด',
  'settings.version': 'เวอร์ชัน {version}',

  // Theme names are product-style names; kept in English on purpose.
  'theme.carbon': 'Carbon Sport',
  'theme.racing': 'Racing M-Sport',
  'theme.neon': 'Cyberpunk Neon',
  'theme.emerald': 'Eco Emerald',
  'theme.amber': 'Classic Amber HUD',
  'theme.stealth': 'Stealth Matte Black',

  'banner.offline': 'ออฟไลน์ · วิดีโอ แผนที่ และเว็บไซต์ต้องใช้อินเทอร์เน็ต',
  'banner.update': 'มีเวอร์ชันใหม่',
  'banner.reload': 'โหลดใหม่',

  'placeholder.dashboard': 'ความเร็ว นาฬิกา และการแจ้งเตือน จะมาในเวอร์ชันถัดไป',
  'placeholder.map': 'Google Maps จะมาในเวอร์ชันถัดไป',
  'placeholder.web': 'การเปิดเว็บไซต์จะมาในเวอร์ชันถัดไป',
  'placeholder.youtube': 'ตัวเล่น YouTube จะมาในเวอร์ชันหน้า',
  'placeholder.webNewTab': 'แท็บใหม่',

  'yt.prev': 'ก่อนหน้า',
  'yt.play': 'เล่น',
  'yt.pause': 'หยุดชั่วคราว',
  'yt.next': 'ถัดไป',
  'yt.simulated': 'ทดสอบการเล่น (จำลอง)',
  'yt.nothingPlaying': 'ยังไม่มีเพลงเล่นอยู่',

  'mini.restore': 'แสดง YouTube',
  'mini.dismiss': 'ซ่อนจอย่อ',
};
