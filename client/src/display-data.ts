// 静态展示数据（与服务端游戏数据对应）：灵根、法宝、遗藏、地点与配图。

import heroImg from "./assets/hero.webp";
import portraitImg from "./assets/portrait.webp";
import marketImg from "./assets/market.webp";
import realmImg from "./assets/realm.webp";
import villageImg from "./assets/village.webp";
import tribulationImg from "./assets/tribulation.webp";
import caveImg from "./assets/cave.webp";
import fieldImg from "./assets/field.webp";
import arenaImg from "./assets/arena.webp";
import demonpassImg from "./assets/demonpass.webp";
import templeImg from "./assets/temple.webp";
import wildsImg from "./assets/wilds.webp";
import iceImg from "./assets/ice.webp";
import fallsImg from "./assets/falls.webp";

export { arenaImg, caveImg, demonpassImg, fallsImg, fieldImg, heroImg, iceImg, marketImg, portraitImg, realmImg, templeImg, tribulationImg, villageImg, wildsImg };

// ---------- static display data (mirrors server game data) ----------

export const ROOTS = [
  { id: "waste", name: "废灵根", desc: "灵根驳杂近乎于无，修炼极慢，机缘奇高。", stats: "战力8 · 神识10 · 机缘22 · 体魄12" },
  { id: "gold", name: "金灵根", desc: "锋锐无匹，剑修的好苗子。", stats: "战力20 · 神识10 · 机缘10 · 体魄13" },
  { id: "wood", name: "木灵根", desc: "生机绵长，体魄强健，最耐熬。", stats: "战力11 · 神识12 · 机缘11 · 体魄20" },
  { id: "water", name: "水灵根", desc: "神识敏锐，善于洞察先机。", stats: "战力10 · 神识20 · 机缘12 · 体魄10" },
  { id: "fire", name: "火灵根", desc: "性烈如火，斗法凶猛。", stats: "战力18 · 神识9 · 机缘10 · 体魄15" },
  { id: "earth", name: "土灵根", desc: "厚重沉稳，防御如山。", stats: "战力12 · 神识9 · 机缘11 · 体魄19" },
  { id: "thunder", name: "雷灵根", desc: "变异灵根，天雷亲和，爆发惊人。", stats: "战力21 · 神识11 · 机缘9 · 体魄12" },
  { id: "ice", name: "冰灵根", desc: "变异灵根，心如止水，神识凝练。", stats: "战力13 · 神识19 · 机缘10 · 体魄12" },
  { id: "swordbody", name: "先天剑体", desc: "特殊体质，天生剑骨。", stats: "战力22 · 神识12 · 机缘10 · 体魄11" },
  { id: "heaven", name: "天灵根", desc: "万中无一，转世大能的命格。", stats: "战力18 · 神识18 · 机缘16 · 体魄16" },
];
export const KEEPSAKE_ARTIFACTS = [
  { id: "sword", name: "青冥剑", icon: "剑", desc: "前世佩剑，战力 +4" },
  { id: "armor", name: "玄龟甲", icon: "甲", desc: "护身至宝，体魄 +4" },
  { id: "gourd", name: "聚灵葫芦", icon: "葫", desc: "聚天地灵气，神识 +4、机缘 +2" },
  { id: "bell", name: "镇魂铃", icon: "铃", desc: "铃声清心，神识 +3、体魄 +2" },
  { id: "mirror", name: "照妖镜", icon: "镜", desc: "镜照虚妄，机缘 +4" },
  { id: "needle", name: "诛仙针匣", icon: "针", desc: "九针如雨，战力 +3、神识 +2" },
  { id: "treasure_compass", name: "寻踪罗盘", icon: "盘", desc: "探索际遇成功收益 +25%" },
  { id: "concord_knot", name: "同心结", icon: "结", desc: "社交情谊增减幅度 +30%" },
  { id: "spirit_hoe", name: "青禾灵锄", icon: "锄", desc: "灵田劳作成功收益 +30%" },
  { id: "moon_rod", name: "钓月竿", icon: "竿", desc: "灵潭垂钓成功收益 +30%" },
  { id: "sect_token", name: "青云功勋令", icon: "令", desc: "宗门差事贡献 +30%" },
  { id: "spring_pendant", name: "回春佩", icon: "佩", desc: "休整回血额外 +15%" },
  { id: "spirit_banner", name: "聚灵幡", icon: "幡", desc: "修炼收益 +18%" },
  { id: "escape_shuttle", name: "遁光梭", icon: "梭", desc: "斗法致死时 35% 遁逃保命" },
  { id: "wealth_basin", name: "聚宝盆", icon: "盆", desc: "寄卖 +30% · 买丹 −10%" },
  { id: "jade_cauldron", name: "青玉丹炉", icon: "炉", desc: "炼丹成功收益 +35%" },
  { id: "forge_hammer", name: "玄铁铸锤", icon: "锤", desc: "炼器成功收益 +35%" },
  { id: "rhino_horn", name: "灵犀角", icon: "角", desc: "封印之蛋现身 +20% · 机缘 +2" },
  { id: "undying_lamp", name: "不灭心灯", icon: "灯", desc: "所受伤害减免 25%" },
  { id: "enlightenment_mat", name: "悟道蒲团", icon: "团", desc: "修炼 +10% · 突破难度 −4" },
  { id: "cave_array", name: "聚灵阵盘", icon: "阵", desc: "洞府内修炼收益 +25%" },
  { id: "pill_king_cauldron", name: "药王鼎", icon: "鼎", desc: "服丹效果 +35%" },
  { id: "purity_lotus", name: "净业宝莲", icon: "莲", desc: "负业力不拖累突破 · 神识 +2" },
  { id: "ban_breaker", name: "破禁锥", icon: "锥", desc: "突破难度 −10" },
  { id: "thunder_orb", name: "天罚雷珠", icon: "珠", desc: "斗法暴击 25% · 战力 +2" },
  { id: "soul_tower", name: "镇魂塔", icon: "塔", desc: "记忆保留率 +12%" },
  { id: "tribulation_umbrella", name: "混元渡劫伞", icon: "伞", desc: "走火入魔 50% 被挡下" },
  { id: "reincarnation_disk", name: "六道轮回盘", icon: "轮", desc: "轮回结算传承点/轮回点 +1" },
];
export const TREASURE_OPTIONS = [
  { id: "tr_pillbox", name: "丹匣", icon: "丹", desc: "埋给后世：取回得修为 +60" },
  { id: "tr_coffer", name: "灵石宝匣", icon: "匣", desc: "埋给后世：取回得灵石 +80" },
  { id: "tr_herbbox", name: "百草囊", icon: "草", desc: "埋给后世：取回得修为 +35、灵石 +40" },
  { id: "tr_scroll", name: "功法残卷匣", icon: "卷", desc: "埋给后世：取回得修为 +90" },
  { id: "tr_jadecase", name: "灵玉宝匣", icon: "玉", desc: "埋给后世：取回得灵石 +140" },
];
export const LOCATIONS = [
  { id: "sect", name: "青云山门", img: heroImg, desc: "灵气充沛 · 修炼+6" },
  { id: "market", name: "临渊坊市", img: marketImg, desc: "交易与奇遇之地" },
  { id: "realm", name: "青冥秘境", img: realmImg, desc: "古修遗府 · 修炼+4" },
  { id: "village", name: "山下凡村", img: villageImg, desc: "出生之地 · 休整最稳" },
  { id: "cave", name: "听涛洞府", img: caveImg, desc: "清修炼丹 · 修炼+5" },
  { id: "fields", name: "百草灵田", img: fieldImg, desc: "种药垂钓 · 稳收灵石" },
  { id: "arena", name: "天骄论道台", img: arenaImg, desc: "天骄争锋 · 需金丹" },
  { id: "demonfront", name: "镇魔关", img: demonpassImg, desc: "抗魔前线 · 需元婴 · 高危" },
  { id: "temple", name: "古刹云深寺", img: templeImg, desc: "坐禅养神 · 修炼+3" },
  { id: "wilds", name: "万兽山脉", img: wildsImg, desc: "猎兽采药 · 需筑基 · 高危" },
  { id: "border", name: "北境雪原", img: iceImg, desc: "冰灵之地 · 需筑基" },
  { id: "falls", name: "天河飞瀑", img: fallsImg, desc: "瀑下炼体 · 修炼+3" },
];
export const ART_BY_KEY: Record<string, string> = {
  sect: heroImg, market: marketImg, realm: realmImg, village: villageImg,
  tribulation: tribulationImg, cave: caveImg, fields: fieldImg, arena: arenaImg, demonfront: demonpassImg,
  temple: templeImg, wilds: wildsImg, ice: iceImg, falls: fallsImg,
};
export const TIER_STYLE: Record<string, string> = {
  gold: "bg-[var(--gold)] text-white",
  purple: "bg-[var(--seal)] text-white",
  blue: "bg-[var(--accent)] text-white",
};
export const TIER_LABEL: Record<string, string> = { gold: "金", purple: "紫", blue: "蓝" };
export const PLAN_LABEL: Record<string, string> = { cultivate: "修炼", rest: "休整", alchemy: "炼丹", forge: "炼器", farm: "灵田", fish: "垂钓" };
