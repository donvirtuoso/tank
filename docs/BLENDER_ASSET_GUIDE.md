# Hướng dẫn chuẩn bị asset xe tăng trong Blender

Tài liệu này mô tả cách dựng/chỉnh mô hình xe tăng trong Blender để xuất ra GLB mà
`src/scene/loaders/glbAdapter.ts` nạp được. Nếu không có GLB, hoặc GLB lỗi, app tự quay
về mô hình procedural và hiện thông báo, nên bước này **không bắt buộc** để chạy app.

Phiên bản tham chiếu: Blender 3.6 LTS / 4.x (exporter glTF 2.0 có sẵn).

---

## 1. Tách mesh theo bộ phận

Mỗi bộ phận chuyển động hoặc thay được phải là **một object riêng**:

| Bộ phận            | Tên object (node) | componentId    | Ghi chú                         |
|--------------------|-------------------|----------------|---------------------------------|
| Thân               | `Hull`            | `hull`         | Gốc của cây                     |
| Tháp pháo          | `Turret`          | `turret`       | Con của `Hull`, xoay quanh trục Y |
| Nòng pháo          | `Barrel`          | `barrel`       | Con của `Turret`, nâng/hạ quanh X |
| Ụ nòng             | `Mantlet`         | `mantlet`      | Con của `Turret`                |
| Xích trái / phải   | `Track_L` / `Track_R` | `track-left` / `track-right` | Con của `Hull` |
| Bánh trái / phải   | `Wheels_L` / `Wheels_R` | `wheels-left` / `wheels-right` | Con của `Hull` |
| Nắp                | `Hatch`           | `hatch`        | Con của `Turret`                |
| Ăng-ten            | `Antenna`         | `antenna`      | Tuỳ chọn                        |

Cách tách: chọn mesh → *Edit Mode* → chọn phần mặt cần tách → `P` → *Selection*.
Chi tiết trang trí (bu-lông, móc kéo…) có thể để thành object con của bộ phận chính.
Chúng sẽ hiện trong panel debug ở mục "Chưa ánh xạ (thuộc …)" và di chuyển cùng bộ phận cha,
không cần thêm vào mapping.

Dựng quan hệ cha–con: chọn con, rồi `Shift`-chọn cha → `Ctrl+P` → *Object (Keep Transform)*.

## 2. Quy ước đặt tên

- Dùng `PascalCase` và `_` giữa các từ, hậu tố hướng là `_L` / `_R`.
- **Không dùng** dấu chấm, khoảng trắng, `:`, `/`, `[`, `]`. Three.js sẽ sanitize các ký tự này
  (`Track.L` thành `TrackL`, khoảng trắng thành `_`), nên tên trong GLB và trong mapping sẽ lệch nhau.
- Đổi tên các bản sao `Hull.001` mà Blender tự sinh trước khi export.
- Phải đặt tên **object** (hiển thị trong Outliner), vì đó là tên node trong glTF. Tên mesh data không được dùng.
- Adapter so khớp tên chính xác trước, rồi mới so khớp không phân biệt hoa/thường.

Bảng ánh xạ nằm ở `src/data/glbNodeMapping.json`:

```json
{
  "version": 1,
  "modelUrl": "/models/tank.glb",
  "maxFileSizeBytes": 10485760,
  "nodes": { "Hull": "hull", "Turret": "turret" },
  "pivots": { "turret": [0, 1.1, 0] }
}
```

Muốn thêm bộ phận mới: thêm cặp `"TênNode": "componentId"` vào `nodes`.

## 3. Đặt origin

- Đặt origin của mỗi object ngay tại **điểm xoay thật**: tâm vòng xoay tháp pháo,
  trục chốt nòng, bản lề nắp.
  Cách làm: đặt 3D cursor (`Shift+S` → *Cursor to Selected* trên các đỉnh của trục),
  rồi *Object → Set Origin → Origin to 3D Cursor*.
- Đặt origin của `Hull` ở mặt đất, tại tâm xe.
- Áp dụng scale/rotation trước khi export: `Ctrl+A` → *All Transforms* (hoặc *Rotation & Scale*
  nếu muốn giữ vị trí). Scale phải bằng 1 thì pivot mới khớp.
- Đơn vị: 1 Blender unit = 1 mét. Mũi xe quay theo **-Y trong Blender**, tương ứng **+Z trong glTF/three**
  sau khi bật *+Y Up*. Nếu hướng lệch, xoay object `Hull` rồi apply rotation.

## 4. Tạo pivot

Có hai cách, chọn một:

1. **Origin đúng ngay trong Blender** (khuyến nghị). Không cần khai báo `pivots`, adapter trả về
   chính node để code xoay.
2. **Pivot cấu hình**: khi không sửa được file nguồn (ví dụ asset của bên thứ ba), khai báo
   `pivots[componentId] = [x, y, z]` trong mapping. Toạ độ tính theo **không gian local của node cha**,
   đơn vị glTF (mét, Y lên). Adapter sẽ:
   - tạo `Group` tên `<componentId>__pivot` đặt tại điểm đó,
   - chuyển node vào trong Group và bù vị trí để hình học đứng yên,
   - trả Group này làm handle, nên xoay Group nghĩa là xoay quanh pivot.

   Cách đọc toạ độ trong Blender: đặt 3D cursor tại điểm xoay, xem *N panel → View → 3D Cursor*.
   Đổi sang glTF theo `(x, y, z)_glTF = (x, z, -y)_Blender`, rồi trừ đi vị trí của object cha.

Có thể dùng Empty làm pivot trong Blender (*Add → Empty → Plain Axes*, đặt làm cha của bộ phận).
Khi đó đặt tên mapping cho **Empty**, không phải cho mesh.

## 5. Export GLB

*File → Export → glTF 2.0 (.glb/.gltf)*:

- **Format**: glTF Binary (`.glb`)
- **Include**: *Selected Objects* (chỉ chọn xe tăng), bỏ camera/đèn
- **Transform**: bật *+Y Up*
- **Data → Mesh**: bật *Apply Modifiers*, *UVs*, *Normals*; tắt *Vertex Colors* nếu không dùng
- **Data → Material**: *Export*; texture nên ≤ 2048px, ưu tiên JPEG/WebP cho màu cơ bản
- **Compression**: **tắt** Draco. Adapter không tải Draco decoder, nên file có
  `KHR_draco_mesh_compression` sẽ bị từ chối
- **Animation**: tắt, trừ khi có kế hoạch dùng

Lưu file vào `public/models/tank.glb`, hoặc đổi `modelUrl` trong mapping.
File phải **tự chứa** (glTF Binary nhúng buffer và texture). Adapter nạp GLB từ bộ nhớ qua object URL,
nên file `.gltf` + `.bin` rời, hoặc texture tham chiếu đường dẫn ngoài, sẽ bị từ chối.

Giới hạn kích thước mặc định là **10 MB** (`maxFileSizeBytes`). Adapter tải file **một lần** và
kiểm tra trước khi giao cho GLTFLoader:

- nếu header `Content-Length` vượt giới hạn, adapter từ chối ngay mà không đọc body;
- nếu không có header này, adapter đọc theo luồng và dừng ngay khi vượt giới hạn.

File quá lớn không bao giờ được parse. App dùng mô hình procedural và hiện thông báo.
Hãy giảm polygon (*Decimate*) hoặc thu nhỏ texture.

Ngoài ra, cây node phải là cây hợp lệ: không có node nào nằm dưới nhiều cha, tối đa 10 000 node
và sâu tối đa 128 cấp. Exporter của Blender luôn tạo cây đúng chuẩn này.

## 6. Kiểm thử

1. Chạy app, mở panel debug (`GlbDebugPanel`) và kiểm tra:
   - **Đã ánh xạ**: đủ các bộ phận chính.
   - **Chưa ánh xạ**: chỉ còn chi tiết trang trí (có ghi "thuộc …"). Node đứng riêng mà chưa ánh xạ
     thường là do đặt sai tên.
   - **Component thiếu node**: có bộ phận trong mapping nhưng không tìm thấy trong GLB.
   - **Component trùng node**: nhiều node cùng ánh xạ vào một componentId. Chỉ node đầu tiên được dùng.
2. Xoay tháp pháo và nâng nòng trong app, kiểm tra trục xoay có đúng không.
3. Có thể kiểm tra nhanh file trên glTF Validator (https://github.khronos.org/glTF-Validator/)
   hoặc gltf.report trước khi đưa vào dự án.
4. Thử đường fallback: đổi tên/xoá file, hoặc dùng file hỏng. App phải hiện mô hình procedural
   kèm thông báo "Không nạp được mô hình GLB…".
5. Unit test (`src/scene/loaders/glbAdapter.test.ts`) tự sinh một GLB tối giản trong bộ nhớ để
   kiểm tra ánh xạ, nên repo không cần chứa file mẫu. `glbAdapter.component.test.ts` kiểm tra
   đường fallback của `GlbTankModel` (thiếu file, file hỏng, quá lớn, lỗi parse).
6. Code điều khiển nhận handle qua `onHandles`. Khi chuyển sang fallback hoặc unmount, adapter phát
   handle rỗng, nên code điều khiển phải bỏ mọi tham chiếu Object3D cũ.

## 7. Giấy phép

- **Không commit** asset nào chưa rõ nguồn gốc hoặc giấy phép. Không lấy mô hình từ game thương mại
  hay trang "free download" không ghi license.
- Chỉ chấp nhận: asset tự làm, **CC0**, **CC-BY** (phải ghi công), hoặc giấy phép khác
  cho phép phân phối lại và đã được nhóm duyệt.
- Mỗi file trong `public/models/` cần ghi vào `public/models/LICENSES.md` các mục sau:
  tên file, tác giả, nguồn (URL), giấy phép, nội dung ghi công, có chỉnh sửa hay không.
- Texture và HDRI đi kèm cũng phải theo đúng quy tắc trên.
- Nếu còn nghi ngờ về giấy phép, đừng đưa vào repo. App vẫn chạy được bằng mô hình procedural.
