# Task 26: CI Guard for Daemon Bundle Dependencies

## What Was Done

Added a new GitHub Actions job `verify-bundle-deps` to `.github/workflows/test-daemon.yml` that:

1. Checks out the code
2. Sets up Bun 1.2.15
3. Installs dependencies
4. Builds the daemon bundle
5. Verifies no forbidden dependencies are bundled

## Key Patterns

- **Forbidden deps**: `@mon/db`, `@mon/config`, `postgres`, `drizzle-orm`, `smol-toml`
- **Guard pattern**: `! grep -E 'require\("(@mon/db|@mon/config|postgres|drizzle-orm|smol-toml)"\)' dist/daemon.cjs`
- The `!` negates the grep exit code, so the step fails if any forbidden deps are found
- Separate job allows parallel execution with existing Docker build test

## Verification

- ✓ Bundle builds successfully (700.0kb)
- ✓ No forbidden dependencies detected in bundle
- ✓ YAML syntax valid
- ✓ Guard logic tested and working
- ✓ Evidence captured at `.sisyphus/evidence/task-26-bundle.txt`

## Notes

- The daemon is correctly using only `@mon/contracts` (not `@mon/db` or `@mon/config`)
- esbuild bundling is working as intended
- The grep pattern matches the CommonJS `require()` calls that would appear in the bundled output
