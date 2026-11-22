import type { EventLocalization } from "../../types";

export const EVENTS_VI: Record<string, EventLocalization> = {
  hn_blessing: { name: "Blessing", subtitleVi: "Phước lành", desc: "Chất của tất cả các lá bài đều được tính là Cơ." },
  hn_curse: { name: "Curse", subtitleVi: "Lời nguyền", desc: "Chất của tất cả các lá bài đều được tính là Bích." },
  hn_ghost_town: {
    name: "Ghost Town",
    subtitleVi: "Thị trấn ma",
    desc: "Đến lượt mình, người đã bị loại hồi sinh thành ma: rút 3 lá, không thể chết, rồi rời bàn cuối lượt.",
  },
  hn_gold_rush: {
    name: "Gold Rush",
    subtitleVi: "Cơn sốt vàng",
    desc: "Chiều lượt chơi đảo ngược chiều kim đồng hồ, bắt đầu từ Cảnh sát trưởng.",
  },
  hn_hangover: { name: "Hangover", subtitleVi: "Say rượu", desc: "Mọi nhân vật đều mất kỹ năng đặc biệt." },
  hn_high_noon: {
    name: "High Noon",
    subtitleVi: "Chính ngọ",
    desc: "Mỗi người chơi mất 1 điểm sinh lực vào đầu lượt của mình.",
  },
  hn_shootout: {
    name: "Shootout",
    subtitleVi: "Đấu súng",
    desc: "Mỗi người chơi được phép đánh thêm lá BANG! thứ hai trong lượt.",
  },
  hn_the_daltons: {
    name: "The Daltons",
    subtitleVi: "Băng đảng Daltons",
    desc: "Khi thẻ mở ra, mỗi người có lá xanh dương trên bàn phải chọn hủy 1 lá.",
  },
  hn_the_doctor: {
    name: "The Doctor",
    subtitleVi: "Bác sĩ thị trấn",
    desc: "Khi thẻ mở ra, những người đang có ít máu nhất được hồi 1 điểm sinh lực.",
  },
  hn_the_reverend: {
    name: "The Reverend",
    subtitleVi: "Mục sư",
    desc: "Người chơi không được phép đánh lá Bia (Beer).",
  },
  hn_the_sermon: {
    name: "The Sermon",
    subtitleVi: "Bài giảng",
    desc: "Người chơi không được đánh lá BANG! trong lượt của mình.",
  },
  hn_thirst: {
    name: "Thirst",
    subtitleVi: "Cơn khát",
    desc: "Mỗi người chỉ rút 1 lá bài thay vì 2 lá trong giai đoạn 1.",
  },
  hn_train_arrival: {
    name: "Train Arrival",
    subtitleVi: "Chuyến tàu tới",
    desc: "Mỗi người được rút thêm 1 lá bài khi kết thúc giai đoạn 1.",
  },
  foc_ambush: {
    name: "Ambush",
    subtitleVi: "Phục kích",
    desc: "Khoảng cách cơ bản giữa mọi cặp người chơi là 1 (chỉ thay đổi bởi trang bị trên bàn).",
  },
  foc_sniper: {
    name: "Sniper",
    subtitleVi: "Xạ thủ bắn tỉa",
    desc: "Trong lượt, có thể đánh gộp 2 lá BANG! cùng lúc vào 1 mục tiêu trong tầm: tính như 1 BANG! nhưng cần 2 Missed! để né.",
  },
  foc_dead_man: {
    name: "Dead Man",
    subtitleVi: "Người chết trở lại",
    desc: "Đến lượt mình, người bị loại đầu tiên quay lại bàn chơi với 2 máu và 2 lá bài.",
  },
  foc_blood_brothers: {
    name: "Blood Brothers",
    subtitleVi: "Anh em kết nghĩa",
    desc: "Đầu lượt, mỗi người có thể giảm 1 máu (trừ giọt máu cuối) để tặng 1 máu cho người khác.",
  },
  foc_the_judge: {
    name: "The Judge",
    subtitleVi: "Thẩm phán",
    desc: "Không ai được đặt bài trang bị trước mặt mình hoặc người khác.",
  },
  foc_lasso: {
    name: "Lasso",
    subtitleVi: "Dây thòng lọng",
    desc: "Mọi lá bài đặt trước mặt người chơi đều mất hiệu lực.",
  },
  foc_law_of_the_west: {
    name: "Law of the West",
    subtitleVi: "Luật miền Tây",
    desc: "Ở giai đoạn 1, lật công khai lá rút thứ hai: nếu chơi được thì bắt buộc phải đánh trong giai đoạn 2.",
  },
  foc_hard_liquor: {
    name: "Hard Liquor",
    subtitleVi: "Rượu mạnh",
    desc: "Mỗi người có thể bỏ qua giai đoạn 1 để hồi 1 điểm sinh lực.",
  },
  foc_abandoned_mine: {
    name: "Abandoned Mine",
    subtitleVi: "Hầm mỏ bỏ hoang",
    desc: "Ở giai đoạn 1, mỗi người rút từ chồng bài bỏ và bỏ bài ngửa mặt lên đỉnh bộ bài.",
  },
  foc_fistful_of_cards: {
    name: "A Fistful of Cards",
    subtitleVi: "Một nắm bài",
    desc: "Đầu lượt, người chơi bị nhắm số phát BANG! bằng đúng số lá bài đang giữ trên tay.",
  },
  foc_peyote: {
    name: "Peyote",
    subtitleVi: "Xương rồng Peyote",
    desc: "Thay vì rút ở giai đoạn 1, đoán màu đỏ hoặc đen của lá trên cùng rồi rút mở ra; đoán đúng được giữ và đoán tiếp.",
  },
  foc_ranch: {
    name: "Ranch",
    subtitleVi: "Trang trại Ranch",
    desc: "Cuối giai đoạn 1, mỗi người được một lần bỏ tùy ý số lá trên tay để rút lại bấy nhiêu lá mới.",
  },
  foc_ricochet: {
    name: "Ricochet",
    subtitleVi: "Đạn nảy",
    desc: "Có thể bắn BANG! vào lá đặt trước mặt người chơi khác: lá đó bị hủy trừ khi chủ nhân đánh Missed! để đỡ.",
  },
  foc_russian_roulette: {
    name: "Russian Roulette",
    subtitleVi: "Cò quay Nga",
    desc: "Từ Cảnh sát trưởng, lần lượt từng người đánh Missed! chống đỡ cho đến khi một người không né được và mất 2 máu.",
  },
  foc_vendetta: {
    name: "Vendetta",
    subtitleVi: "Rửa hận",
    desc: "Cuối lượt, xét lá bài trên cùng: nếu ra Cơ, được đi thêm 1 lượt nữa (không kích hoạt lại Rửa hận).",
  },
};
