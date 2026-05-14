export const classes = [
  { name: "Lord Knight", short: "LK", group: "red", icon: "/icons/lord-knight.png" },
  { name: "Paladin", short: "Pal", group: "red", icon: "/icons/paladin.png" },
  { name: "High Wizard", short: "HW", group: "blue", icon: "/icons/high-wizard.png" },
  { name: "Professor", short: "Prof", group: "blue", icon: "/icons/professor.png" },
  { name: "High Priest", short: "HP", group: "emerald", icon: "/icons/high-priest.png" },
  { name: "Champion", short: "Champ", group: "emerald", icon: "/icons/champion.png" },
  { name: "Sniper", short: "Sn", group: "yellow", icon: "/icons/sniper.png" },
  { name: "Bard", short: "Bard", group: "yellow", icon: "/icons/bard.png" },
  { name: "Dancer", short: "Danc", group: "yellow", icon: "/icons/dancer.png" },
  { name: "Assassin Cross", short: "SinX", group: "purple", icon: "/icons/assassin-cross.png" },
  { name: "Stalker", short: "Stk", group: "purple", icon: "/icons/stalker.png" },
  { name: "Whitesmith", short: "WS", group: "orange", icon: "/icons/whitesmith.png" },
  { name: "Biochemist", short: "BC", group: "orange", icon: "/icons/biochemist.png" },
  { name: "Doram", short: "Dor", group: "pink", icon: "/icons/doram.png" }
];

export const classOrder = classes.map((item) => item.name);

export const classByName = Object.fromEntries(classes.map((item) => [item.name, item]));

export const colorGroups = {
  red: "#ef4444",
  blue: "#3b82f6",
  emerald: "#10b981",
  yellow: "#eab308",
  purple: "#8b5cf6",
  orange: "#f97316",
  pink: "#ec4899"
};
