import type { CharacterLocalization } from "../../types";

export const CHARACTERS_VI: Record<string, CharacterLocalization> = {
  char_bart_cassidy: {
    name: "Bart Cassidy",
    desc: "Mỗi khi mất 1 điểm sinh lực, ông rút ngay 1 lá bài từ bộ bài.",
    symbolDesc: "4 điểm sinh lực. Mỗi lần mất 1 máu, rút ngay 1 lá từ bộ bài.",
  },
  char_black_jack: {
    name: "Black Jack",
    desc: "Ở giai đoạn 1, ông lật lá bài thứ hai vừa rút: nếu là Cơ hoặc Rô, ông được rút thêm 1 lá.",
    symbolDesc: "4 điểm sinh lực. Giai đoạn 1 lật công khai lá rút thứ hai: nếu ra Cơ hoặc Rô thì rút thêm 1 lá.",
  },
  char_calamity_janet: {
    name: "Calamity Janet",
    desc: "Bà có thể dùng lá BANG! như lá Missed! và ngược lại.",
    symbolDesc: "4 điểm sinh lực. Có thể đánh BANG! thay cho Missed! và đánh Missed! thay cho BANG!.",
  },
  char_el_gringo: {
    name: "El Gringo",
    desc: "Mỗi khi mất 1 điểm sinh lực do lá bài của người khác, gã cướp ngẫu nhiên 1 lá trên tay kẻ đó.",
    symbolDesc: "3 điểm sinh lực. Mỗi lần mất 1 máu bởi bài người khác, cướp ngẫu nhiên 1 lá trên tay kẻ tấn công.",
  },
  char_jesse_jones: {
    name: "Jesse Jones",
    desc: "Ở giai đoạn 1, ông có thể chọn cướp lá đầu tiên từ tay của 1 người chơi thay vì rút từ bộ bài.",
    symbolDesc: "4 điểm sinh lực. Giai đoạn 1 có thể cướp lá đầu từ tay người khác thay vì rút bộ bài.",
  },
  char_jourdonnais: {
    name: "Jourdonnais",
    desc: "Mỗi khi bị bắn BANG!, ông có thể xét lá bài trên cùng: nếu ra Cơ, phát bắn bị hủy.",
    symbolDesc: "4 điểm sinh lực. Có sẵn Thùng gỗ: khi bị bắn BANG!, xét lá trên cùng—ra Cơ thì hủy phát bắn.",
  },
  char_kit_carlson: {
    name: "Kit Carlson",
    desc: "Ở giai đoạn 1, ông xem 3 lá trên cùng bộ bài, chọn lấy 2 lá lên tay và đặt lại 1 lá lên đỉnh.",
    symbolDesc: "4 điểm sinh lực. Giai đoạn 1 xem 3 lá trên cùng, chọn giữ 2 lá, trả 1 lá lại đỉnh bộ bài.",
  },
  char_lucky_duke: {
    name: "Lucky Duke",
    desc: "Mỗi khi cần thực hiện Xét, ông xét 2 lá trên cùng và tự chọn kết quả áp dụng.",
    symbolDesc: "4 điểm sinh lực. Mỗi lần phải Xét, kiểm tra 2 lá trên cùng và chọn kết quả có lợi nhất.",
  },
  char_paul_regret: {
    name: "Paul Regret",
    desc: "Mọi người chơi khác nhìn khoảng cách tới ông tăng thêm +1.",
    symbolDesc: "3 điểm sinh lực. Có sẵn Mustang: mọi người chơi khác tính khoảng cách đến ông +1.",
  },
  char_pedro_ramirez: {
    name: "Pedro Ramirez",
    desc: "Ở giai đoạn 1, ông có thể rút lá đầu tiên từ đỉnh chồng bài bỏ thay vì từ bộ bài.",
    symbolDesc: "4 điểm sinh lực. Giai đoạn 1 có thể rút lá đầu tiên từ chồng bài bỏ thay vì bộ bài.",
  },
  char_rose_doolan: {
    name: "Rose Doolan",
    desc: "Bà nhìn khoảng cách tới mọi người chơi khác giảm -1 (tối thiểu 1).",
    symbolDesc: "4 điểm sinh lực. Có sẵn Scope: nhìn khoảng cách tới mọi người giảm -1 (tối thiểu 1).",
  },
  char_sid_ketchum: {
    name: "Sid Ketchum",
    desc: "Bất cứ lúc nào, ông có thể bỏ 2 lá bài từ tay để hồi 1 điểm sinh lực.",
    symbolDesc: "4 điểm sinh lực. Có thể bỏ 2 lá bài trên tay để hồi 1 điểm sinh lực.",
  },
  char_slab_the_killer: {
    name: "Slab the Killer",
    desc: "Người bị ông bắn BANG! phải dùng 2 hiệu ứng Né (Missed!) để hủy phát bắn.",
    symbolDesc: "4 điểm sinh lực. Phát BANG! của gã đòi hỏi mục tiêu phải né 2 lần mới hủy được.",
  },
  char_suzy_lafayette: {
    name: "Suzy Lafayette",
    desc: "Ngay khi trên tay không còn lá bài nào, bà rút ngay 1 lá từ bộ bài.",
    symbolDesc: "4 điểm sinh lực. Ngay lúc tay hết sạch bài, rút ngay 1 lá mới từ bộ bài.",
  },
  char_vulture_sam: {
    name: "Vulture Sam",
    desc: "Mỗi khi có người bị loại, gã lấy toàn bộ bài (trên tay và trên bàn) của người đó về tay mình.",
    symbolDesc: "4 điểm sinh lực. Khi một người bị loại, lấy toàn bộ bài trên tay và trước mặt họ.",
  },
  char_willy_the_kid: {
    name: "Willy the Kid",
    desc: "Ông có thể bắn bao nhiêu lá BANG! tùy thích trong lượt của mình.",
    symbolDesc: "4 điểm sinh lực. Có thể chơi không giới hạn số lượng lá BANG! mỗi lượt.",
  },
  char_apache_kid: {
    name: "Apache Kid",
    desc: "Các lá bài chất Rô do người chơi khác đánh ra không có tác dụng lên ông.",
    symbolDesc: "3 điểm sinh lực. Miễn nhiễm hoàn toàn với các lá bài chất Rô từ người khác.",
  },
  char_belle_star: {
    name: "Belle Star",
    desc: "Trong lượt của bà, mọi lá bài đang đặt trước mặt người chơi khác đều bị vô hiệu hóa.",
    symbolDesc: "4 điểm sinh lực. Trong lượt của mình, vô hiệu hóa toàn bộ trang bị trước mặt người khác.",
  },
  char_bill_noface: {
    name: "Bill Noface",
    desc: "Ở giai đoạn 1, ông rút 1 lá cộng thêm 1 lá cho mỗi điểm sinh lực đang mất.",
    symbolDesc: "4 điểm sinh lực. Giai đoạn 1 rút 1 lá cộng thêm 1 lá với mỗi điểm máu bị mất.",
  },
  char_chuck_wengam: {
    name: "Chuck Wengam",
    desc: "Trong lượt, ông có thể tự giảm 1 điểm sinh lực (không giảm về 0) để rút 2 lá bài.",
    symbolDesc: "4 điểm sinh lực. Trong lượt có thể mất 1 máu (trừ giọt máu cuối) để rút 2 lá.",
  },
  char_doc_holyday: {
    name: "Doc Holyday",
    desc: "Mỗi lượt một lần, ông có thể bỏ 2 lá bất kỳ trên tay để bắn 1 phát BANG! (không tính giới hạn lượt).",
    symbolDesc: "4 điểm sinh lực. Mỗi lượt 1 lần, bỏ 2 lá bất kỳ để bắn 1 BANG! miễn phí giới hạn.",
  },
  char_elena_fuente: {
    name: "Elena Fuente",
    desc: "Bà có thể dùng bất kỳ lá bài nào trên tay như một lá Missed!.",
    symbolDesc: "3 điểm sinh lực. Mọi lá bài trên tay đều có thể dùng để né (Missed!).",
  },
  char_greg_digger: {
    name: "Greg Digger",
    desc: "Mỗi khi có người chơi khác bị loại, ông hồi 2 điểm sinh lực.",
    symbolDesc: "4 điểm sinh lực. Mỗi lần có người bị loại khỏi ván đấu, hồi 2 điểm sinh lực.",
  },
  char_herb_hunter: {
    name: "Herb Hunter",
    desc: "Mỗi khi có người chơi khác bị loại, ông rút thêm 2 lá bài từ bộ bài.",
    symbolDesc: "4 điểm sinh lực. Mỗi lần có người bị loại khỏi ván đấu, rút thêm 2 lá bài.",
  },
  char_jose_delgado: {
    name: "Jose Delgado",
    desc: "Tối đa hai lần mỗi lượt, ông có thể bỏ 1 lá viền xanh dương trên tay để rút 2 lá bài.",
    symbolDesc: "4 điểm sinh lực. Tối đa 2 lần/lượt, bỏ 1 lá xanh dương trên tay để rút 2 lá.",
  },
  char_molly_stark: {
    name: "Molly Stark",
    desc: "Mỗi khi dùng hoặc đánh đáp trả một lá bài từ tay ngoài lượt của mình, bà rút 1 lá bài.",
    symbolDesc: "4 điểm sinh lực. Mỗi lần dùng bài trên tay ngoài lượt, rút bù 1 lá từ bộ bài.",
  },
  char_pat_brennan: {
    name: "Pat Brennan",
    desc: "Ở giai đoạn 1, thay vì rút bài từ bộ bài, ông có thể cướp 1 lá đang đặt trước mặt người chơi bất kỳ.",
    symbolDesc: "4 điểm sinh lực. Giai đoạn 1 có thể bỏ qua rút bài để cướp 1 lá đang trên bàn của ai đó.",
  },
  char_pixie_pete: {
    name: "Pixie Pete",
    desc: "Ở giai đoạn 1, ông rút 3 lá bài thay vì 2 lá.",
    symbolDesc: "3 điểm sinh lực. Giai đoạn 1 rút 3 lá bài thay vì 2 lá.",
  },
  char_sean_mallory: {
    name: "Sean Mallory",
    desc: "Ở cuối lượt (giai đoạn 3), ông được giữ tối đa 10 lá trên tay thay vì giới hạn theo máu hiện tại.",
    symbolDesc: "3 điểm sinh lực. Giới hạn bài giữ cuối lượt là 10 lá thay vì bằng số máu.",
  },
  char_tequila_joe: {
    name: "Tequila Joe",
    desc: "Mỗi khi đánh lá Bia (Beer), ông hồi 2 điểm sinh lực thay vì 1.",
    symbolDesc: "4 điểm sinh lực. Mỗi lá Bia giúp ông hồi 2 máu thay vì 1.",
  },
  char_vera_custer: {
    name: "Vera Custer",
    desc: "Đầu lượt (trước giai đoạn 1), bà chọn sao chép kỹ năng của 1 nhân vật khác đang sống tới lượt kế.",
    symbolDesc: "3 điểm sinh lực. Trước giai đoạn 1, chọn sao chép kỹ năng của 1 nhân vật khác đến lượt sau.",
  },
};
