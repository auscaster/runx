# Contributing to runx

Thanks for considering a contribution. This document covers the contribution
workflow and the sign-off required on every commit.

## Licensing

runx is licensed under the Apache License, Version 2.0. By contributing, you
agree that your contributions will be licensed under the same license. See
[LICENSE](./LICENSE) for the full text.

## Developer Certificate of Origin (DCO)

All commits to this repository must be signed off under the
[Developer Certificate of Origin](https://developercertificate.org/). The DCO
is a lightweight affirmation that you have the right to submit the contribution
under the project's license. There is no separate CLA to sign.

Sign off on every commit by adding a `Signed-off-by:` trailer. The easiest way
is to pass `-s` to `git commit`:

```
git commit -s -m "your commit message"
```

This appends a trailer that looks like:

```
Signed-off-by: Your Name <your.email@example.com>
```

The name and email must match the real identity you wish to be associated
with the contribution. Pseudonymous sign-offs are not accepted.

The full DCO text (reproduced here for reference):

> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I have the
>     right to submit it under the open source license indicated in the file;
>     or
>
> (b) The contribution is based upon previous work that, to the best of my
>     knowledge, is covered under an appropriate open source license and I
>     have the right under that license to submit that work with modifications,
>     whether created in whole or in part by me, under the same open source
>     license (unless I am permitted to submit under a different license), as
>     indicated in the file; or
>
> (c) The contribution was provided directly to me by some other person who
>     certified (a), (b) or (c) and I have not modified it.
>
> (d) I understand and agree that this project and the contribution are public
>     and that a record of the contribution (including all personal information
>     I submit with it, including my sign-off) is maintained indefinitely and
>     may be redistributed consistent with this project and the open source
>     license(s) involved.

## Contribution workflow

1. Open an issue describing the change before sending a PR for anything
   non-trivial. Small fixes can go straight to a PR.
2. Fork the repo and create a topic branch from `main`.
3. Make your change. Keep commits focused and conventional (`feat:`, `fix:`,
   `docs:`, `chore:`, etc.).
4. Run the workspace checks locally:
   - `pnpm typecheck`
   - `pnpm test`
5. Sign off your commits with `git commit -s` (see DCO above).
6. Open a pull request against `main` with a clear description of the change
   and any test or validation evidence.

## Code of conduct

Be respectful. Assume good faith. Disagreement on technical direction is
welcome; personal attacks are not.

## Reporting security issues

Do not open a public issue for security vulnerabilities. Email the maintainers
privately instead. Once a fix is ready, the issue and fix can be disclosed
publicly.
