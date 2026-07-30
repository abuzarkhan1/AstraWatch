import React from "react";

export const BackgroundSnippets = () => {
  return (
    <div className="absolute inset-0 z-0 h-full w-full items-center px-5 py-24 [background:radial-gradient(125%_125%_at_50%_10%,#000_40%,#3131f5_100%)] pointer-events-none" />
  );
};

export const BackgroundGridSnippets = () => {
  return (
    <div className="absolute inset-0 z-0 h-full w-full bg-black bg-[linear-gradient(to_right,#1f1f2e_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2e_1px,transparent_1px)] bg-[size:6rem_4rem] pointer-events-none">
      <div className="absolute bottom-0 left-0 right-0 top-0 bg-[radial-gradient(circle_800px_at_100%_200px,#3131f5_20%,transparent)] opacity-40"></div>
    </div>
  );
};

export default BackgroundSnippets;
