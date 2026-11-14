/**
 * Từ điển tiếng Việt — ngôn ngữ mặc định và là nguồn chuẩn cho kiểu `Dictionary`.
 * Mọi ngôn ngữ khác phải có đúng cùng cấu trúc khoá.
 */
export const viMessages = {
  app: {
    title: 'Xưởng Xe Tăng',
    subtitle: 'Trình xem 3D tương tác',
    loading: 'Đang tải…',
    loadingViewport: 'Đang khởi tạo khung nhìn 3D…',
  },
  nav: {
    label: 'Chế độ làm việc',
  },
  modes: {
    explore: {
      label: 'Khám phá',
      description: 'Xoay, phóng to và tìm hiểu từng bộ phận của xe tăng.',
      leftTitle: 'Bộ phận',
      leftEmpty: 'Chưa có mô hình nào được tải.',
      rightTitle: 'Thông tin chi tiết',
      rightEmpty: 'Chọn một bộ phận để xem thông tin.',
    },
    assembly: {
      label: 'Lắp ráp',
      description: 'Lắp ráp xe tăng theo từng bước có hướng dẫn.',
      leftTitle: 'Các bước lắp ráp',
      leftEmpty: 'Chưa có quy trình lắp ráp.',
      rightTitle: 'Hướng dẫn',
      rightEmpty: 'Chọn một bước để xem hướng dẫn.',
    },
    design: {
      label: 'Thiết kế',
      description: 'Tùy biến cấu hình, màu sơn và trang bị.',
      leftTitle: 'Thư viện chi tiết',
      leftEmpty: 'Thư viện đang trống.',
      rightTitle: 'Thuộc tính',
      rightEmpty: 'Chọn một chi tiết để chỉnh thuộc tính.',
    },
    compare: {
      label: 'So sánh',
      description: 'Đặt các mẫu xe cạnh nhau để so sánh thông số.',
      leftTitle: 'Danh sách xe',
      leftEmpty: 'Chưa chọn xe nào để so sánh.',
      rightTitle: 'Bảng thông số',
      rightEmpty: 'Thêm ít nhất hai xe để so sánh.',
    },
  },
  panels: {
    collapseLeft: 'Thu gọn bảng trái',
    expandLeft: 'Mở rộng bảng trái',
    collapseRight: 'Thu gọn bảng phải',
    expandRight: 'Mở rộng bảng phải',
  },
  viewport: {
    label: 'Khung nhìn 3D',
    placeholder: 'Khung nhìn 3D sẽ hiển thị tại đây',
    mode: 'Chế độ',
    environment: 'Môi trường',
    displayMode: 'Hiển thị',
    model: 'Mô hình',
    modelProcedural: 'Dựng sẵn',
    modelGlb: 'File GLB',
    modelToggle: 'Đổi mô hình hiển thị',
    glbNote: 'Mô hình GLB chưa tách bộ phận: chọn, tháo rời và mở nắp chỉ hoạt động với mô hình dựng sẵn.',
  },
  toolbar: {
    label: 'Thanh công cụ',
    displayMode: 'Chế độ hiển thị',
    environment: 'Môi trường',
    resetView: 'Đặt lại góc nhìn',
    viewReset: 'Đã đặt lại góc nhìn',
  },
  displayModes: {
    shaded: 'Tô bóng',
    wireframe: 'Khung dây',
    xray: 'X-quang',
  },
  environments: {
    studio: 'Studio',
    desert: 'Sa mạc',
    forest: 'Rừng',
    night: 'Ban đêm',
  },
  settings: {
    title: 'Cài đặt',
    open: 'Mở cài đặt',
    close: 'Đóng cài đặt',
    language: 'Ngôn ngữ',
    languageChanged: 'Đã chuyển sang tiếng Việt',
  },
  languages: {
    vi: 'Tiếng Việt',
    en: 'English',
  },
  toast: {
    region: 'Thông báo',
    dismiss: 'Đóng thông báo',
  },
  smallScreen: {
    title: 'Màn hình quá nhỏ',
    message: 'Ứng dụng cần màn hình rộng tối thiểu {width}px để hiển thị đầy đủ.',
    hint: 'Hãy dùng máy tính hoặc xoay ngang thiết bị / phóng to cửa sổ trình duyệt.',
  },
};
