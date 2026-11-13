# tank

Ứng dụng web xem/lắp ráp/thiết kế/so sánh xe tăng 3D, xây dựng bằng **Vite + React + TypeScript (strict) + Tailwind CSS**, dùng three.js / React Three Fiber cho phần 3D.

Bốn chế độ làm việc (chuyển qua TopBar, đồng bộ với URL hash `#/<mode>`):

| Mode       | Tiếng Việt | Mục đích                                  |
| ---------- | ---------- | ----------------------------------------- |
| `explore`  | Khám phá   | Xoay, phóng to, tìm hiểu từng bộ phận     |
| `assembly` | Lắp ráp    | Lắp ráp từng bước có hướng dẫn            |
| `design`   | Thiết kế   | Tùy biến cấu hình, màu sơn, trang bị      |
| `compare`  | So sánh    | Đặt các mẫu xe cạnh nhau, so sánh thông số |

## Yêu cầu

- Node.js >= 20.19 (khuyến nghị bản LTS mới nhất)
- npm >= 10

## Cài đặt & chạy

```bash
npm install          # cài dependency
npm run dev          # chạy dev server tại http://localhost:5173
```

Lần đầu chạy test E2E cần cài trình duyệt cho Playwright:

```bash
npx playwright install chromium
```

## Các lệnh

| Lệnh                   | Mô tả                                           |
| ---------------------- | ----------------------------------------------- |
| `npm run dev`          | Dev server có HMR                               |
| `npm run build`        | Kiểm tra kiểu rồi build production vào `dist/`  |
| `npm run preview`      | Xem thử bản build                               |
| `npm run typecheck`    | Kiểm tra kiểu TypeScript (`tsc --noEmit`)       |
| `npm run lint`         | ESLint                                          |
| `npm run format`       | Prettier (ghi đè) — `format:check` để chỉ kiểm tra |
| `npm test`             | Unit/component test (Vitest + Testing Library)  |
| `npm run test:watch`   | Vitest ở chế độ watch                           |
| `npm run test:e2e`     | E2E test (Playwright, tự khởi động dev server)  |

## Cấu trúc thư mục

```
├─ e2e/                      # Playwright E2E test
├─ src/
│  ├─ app/                   # Root App, điều hướng mode (hash routing)
│  ├─ components/
│  │  ├─ layout/             # AppShell, TopBar, Left/RightPanel, Viewport, BottomToolbar, fallback màn hình nhỏ
│  │  ├─ settings/           # Hộp thoại cài đặt
│  │  └─ ui/                 # Toaster, LoadingScreen
│  ├─ hooks/                 # Hook dùng chung (useMediaQuery…)
│  ├─ i18n/                  # Từ điển vi (mặc định) / en, useT(), format()
│  ├─ lib/                   # Tiện ích thuần
│  ├─ stores/                # Zustand stores (viewer, ui, toast)
│  ├─ styles/                # CSS toàn cục + Tailwind
│  └─ test/                  # Thiết lập Vitest
├─ tailwind.config.ts        # Theme tối gunmetal / olive / brass
└─ vite.config.ts            # Vite + alias `@/` + cấu hình Vitest
```

## Quy ước

- Import nội bộ dùng alias `@/` (trỏ tới `src/`).
- Mọi chuỗi giao diện đặt trong `src/i18n/vi.ts` và `src/i18n/en.ts`; kiểu `Dictionary` lấy từ bản tiếng Việt nên thiếu khoá ở bản tiếng Anh sẽ báo lỗi khi typecheck.
- Màn hình hẹp hơn 1024px sẽ hiển thị thông báo thay vì layout đầy đủ.
