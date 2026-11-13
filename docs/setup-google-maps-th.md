# ตั้งค่า Google Maps ให้ JorGu (ทำครั้งเดียว)

กฎของแอปคือ **ห้ามเสียเงิน**: JorGu นับเองทุกเดือน ไม่เกิน 1% ต่ำกว่าโควตาฟรี (โหลดแผนที่ 9,900 · เส้นทาง 9,900 · รถติดบนเส้นทาง 4,950 ครั้ง/เดือน) แต่ละวันใช้ได้ = ที่เหลือของเดือน ÷ จำนวนวันที่เหลือ วันไหนใช้น้อย ส่วนที่เหลือยกไปวันถัดไป ข้อ 3 คือตัวกันที่ Google บังคับเอง (ใช้ได้เมื่อ upgrade จาก Free Trial แล้ว) **ให้ทำข้อ 3 ก่อนเอา key ไปใส่ใน Cloudflare**

ชื่อเมนูใน Google Cloud อาจต่างจากนี้เล็กน้อย ถ้าหาไม่เจอ ให้ใช้ช่องค้นหาด้านบนของหน้า console

## A. Google Cloud — https://console.cloud.google.com

เลือกโปรเจกต์เดียวกับที่ใช้ทำ YouTube login (มุมซ้ายบน)

1. **ผูกบัตร**
   ☰ → **Billing** → **Link a billing account** → สร้างบัญชีเรียกเก็บเงินและใส่บัตร

2. **เปิด API 2 ตัว**
   ☰ → **APIs & Services** → **Library** → ค้นหาแล้วกด **Enable** ทีละตัว
   - **Maps JavaScript API**
   - **Maps Embed API**

   ยังไม่ต้องเปิด Routes API เพราะเส้นทางแบบคิดเงินปิดอยู่ในแอป ตอนนี้เส้นทางใช้แผนที่ธรรมดาซึ่งฟรี

3. **ตั้งเพดานรายวัน (สำคัญที่สุด)**
   ☰ → **Google Maps Platform** → **Quotas** → เลือก API: **Maps JavaScript API** → หาแถว **Map loads per day** → กดดินสอ ✏️ → ใส่ **320** → **Save**
   - ถ้าไม่มีแถวแบบ "per day" ให้หยุด แล้วบอกผมก่อน อย่าทำข้อ 7
   - Maps Embed API ฟรีไม่จำกัด ไม่ต้องตั้ง

4. **ตั้งแจ้งเตือนงบ** (เตือนเฉยๆ ไม่ได้หยุดการใช้งาน)
   ☰ → **Billing** → **Budgets & alerts** → **Create budget** → Amount **1 USD** → แจ้งเตือนที่ 50% / 90% / 100% → **Finish**

5. **สร้าง API key**
   ☰ → **APIs & Services** → **Credentials** → **+ Create credentials** → **API key** → กดชื่อ key ที่ได้เพื่อแก้ไข
   - Name: `JorGu Maps`
   - **Application restrictions** → **Websites** → Add ทีละบรรทัด:
     - `https://jorgu.pv-proj.workers.dev/*`
     - `http://localhost:5173/*`
   - **API restrictions** → **Restrict key** → ติ๊ก **Maps JavaScript API** และ **Maps Embed API**
   - **Save** แล้วคัดลอก key (ขึ้นต้นด้วย `AIza…`)

6. **สร้าง Map ID**
   ☰ → **Google Maps Platform** → **Map management** → **Create Map ID**
   - Name: `JorGu`
   - Map type: **JavaScript** → **Vector**
   - **Save** แล้วคัดลอก Map ID

## B. Cloudflare — https://dash.cloudflare.com

7. **Workers & Pages** → **jorgu** → **Settings** → **Build** → **Variables and secrets** (ส่วน Build variables) → **Add**
   - `VITE_GOOGLE_MAPS_API_KEY` = key จากข้อ 5
   - `VITE_GOOGLE_MAP_ID` = Map ID จากข้อ 6
   - **Save**

   key นี้จะอยู่ในหน้าเว็บ ซึ่งเป็นเรื่องปกติของแผนที่บนเว็บ ข้อ 5 ล็อกไว้ให้ใช้ได้เฉพาะเว็บ JorGu และข้อ 3 กันไม่ให้เกินโควตาฟรี

8. **Deployments** → รายการล่าสุด → **Retry build** หรือบอกผม แล้วผมจะ push ให้ build ใหม่

## C. เช็คว่าใช้ได้

- เปิด JorGu → จอแผนที่ต้องขึ้นแผนที่ Google
- **Settings → แผนที่** ต้องขึ้นว่า "โหลดแผนที่: เหลือ … ครั้งเดือนนี้ · วันนี้ … / …" (ตัวหลังคือที่วันนี้ใช้ได้)
- ถ้าขึ้นว่า "Google ไม่รับ key แผนที่" ให้เช็คข้อ 2 และข้อ 5 (เว็บไซต์ที่ใส่ต้องตรงทุกตัวอักษร) แล้วบอกผม

## D. เส้นทางบนแผนที่สด — Routes API

ค้นหาที่หมายแล้วเส้นทางจะวาดเป็นเส้นน้ำเงินบนแผนที่สด พร้อมจุดรถเลื่อนตามจริง และ**แถบรถติดข้างแผนที่** (เขียว/ส้ม/แดง ตามช่วงถนนข้างหน้า) ถ้า Routes API ยังไม่เปิด แอปจะแสดงเส้นทางในแผนที่ธรรมดาแทน:

1. ☰ → **APIs & Services** → **Library** → **Routes API** → **Enable** (ไม่ใช่ *Route Optimization API* ตัวนั้นเป็นของกองรถขนส่ง ถ้าเผลอเปิดไว้ให้กด **Disable**)
2. ☰ → **APIs & Services** → **Credentials** → กดชื่อ key → **API restrictions** → ติ๊กเพิ่ม **Routes API** (รวม 3 ตัว) → **Save**
3. ใน JorGu ไม่ต้องตั้งอะไร (ถ้าอยากใช้แผนที่ธรรมดาแทน: **Settings → แผนที่** → **เส้นทาง: แผนที่ธรรมดา (ฟรี)**)
4. ตอน upgrade บัญชี (หลังหมด Free Trial) ให้ตั้งเพดาน **160** ที่ **Google Maps Platform → Quotas → Routes API → Directions - ComputeRoutes per request quota per day** (เส้นทางกับแถบรถติดนับรวมกันในแถวนี้ ส่วนแถบรถติดเป็นระดับ Pro ฟรีแค่ 5,000/เดือน: 160 × 31 = 4,960) และตั้ง Map loads per day ของ Maps JavaScript API เป็น 320

การเลือกเส้นทางไม่คิดการจราจร (แพ็กเกจราคาถูกสุด) อาจไม่ตรงกับเส้นที่แอป Google Maps พาไป แต่แถบรถติดกับเวลาถึงคิดการจราจรจริง (แพ็กเกจ Pro) ให้ยึดเสียงนำทางของแอป Google Maps เป็นหลัก

## ช่วง Free Trial

ระหว่างทดลองใช้ Google แก้โควตาไม่ได้ ("Free trial does not permit quota increases") แต่ก็**ตัดเงินจากบัตรไม่ได้** จนกว่าคุณจะกด Upgrade / Activate full account เอง แอปนับและจำกัดเองอยู่แล้ว **ตอนกด Upgrade ให้ตั้งเพดานทันที**: โหลดแผนที่ 320/วัน (ข้อ 3) และเส้นทาง 160/วัน (ข้อ D4) เพดานของ Google เป็นรายวันตายตัว เลยยกยอดวันที่ใช้น้อยไม่ได้ แต่กันไม่ให้เสียเงินแน่นอน

