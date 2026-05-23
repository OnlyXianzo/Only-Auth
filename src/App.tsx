import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Basic greet command invocation to verify Tauri API bindings
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-zinc-950 text-zinc-50 font-sans p-6 select-none">
      <div className="text-center max-w-md w-full">
        <h1 className="text-3xl font-extrabold tracking-tight">Only Auth</h1>
        <p className="mt-2 text-sm text-zinc-400 font-medium">Phase 1: Tauri v2 Core Shell</p>
        
        <form
          className="mt-8 flex gap-2 justify-center"
          onSubmit={(e) => {
            e.preventDefault();
            greet();
          }}
        >
          <input
            id="greet-input"
            className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-700 transition"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Enter a name..."
          />
          <button 
            type="submit"
            className="px-4 py-1.5 bg-zinc-100 text-zinc-900 text-sm font-semibold rounded hover:bg-zinc-200 active:scale-95 transition"
          >
            Greet
          </button>
        </form>
        {greetMsg && (
          <p className="mt-4 text-xs font-mono text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 rounded py-2 px-3 inline-block">
            {greetMsg}
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
