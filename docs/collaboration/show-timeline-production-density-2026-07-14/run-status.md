# Dual-model run status

The dual-model run completed on 2026-07-14 after the user explicitly approved
sending the solution-neutral brief and named private repository context to
Anthropic Claude/Fable.

The bundled launcher required a local compatibility repair: the installed
Claude CLI treats `--allowedTools` as variadic, which consumed the positional
prompt, and allowing tools did not restrict unavailable tools. The successful
run supplied the prompt through standard input and passed both `--tools` and
`--allowedTools` with `Read,Edit,Write,Glob,Grep`. Fable changed only
`claude-proposal.md`.

`claude-proposal.md` and `codex-proposal.md` were completed independently before
either was compared. `comparison.md` preserves their distinct contributions and
real disagreements; `final-design.md` records the shared foundation and human
review gates.
