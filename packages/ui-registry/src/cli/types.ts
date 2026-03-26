export type Block = {
  id: string;
  name: string;
  description: string;
  dependencies: string[];
  peerDependencies: string[];
  files: string[];
};

export type Registry = {
  version: number;
  blocks: Block[];
};

export type Config = {
  outDir: string;
  overwrite: boolean;
};
