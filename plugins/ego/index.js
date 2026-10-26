import { fileURLToPath } from "node:url";

const skillsPath = fileURLToPath(new URL("./skills", import.meta.url));

export const EgoBrowserPlugin = async () => ({
  config: async (config) => {
    // OpenCode hands plugins its normalized config, which keeps extra Skill
    // folders in skills.paths. Each discovered Skill also becomes a command.
    config.skills ??= {};
    config.skills.paths ??= [];
    if (!config.skills.paths.includes(skillsPath)) {
      config.skills.paths.push(skillsPath);
    }
  },
});
