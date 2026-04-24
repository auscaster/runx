# Releasing runx-py

Releases are automated. Tag a commit and the [`Publish runx-py`](../../.github/workflows/publish-runx-py.yml) workflow builds, tests, publishes to PyPI via OIDC trusted publishing, and cuts a GitHub release.

## One-time setup

Before the first automated release, add `runx-py` as a trusted publisher on PyPI.

1. Visit <https://pypi.org/manage/project/runx-py/settings/publishing/>.
2. Under *Add a new pending publisher*, choose **GitHub**.
3. Fill in:
   - Owner: `runxhq`
   - Repository name: `runx`
   - Workflow filename: `publish-runx-py.yml`
   - Environment name: *(leave blank)*
4. Save.

With trusted publishing configured, no PyPI API token is stored on GitHub. Any legacy account-scoped token used for manual uploads should be revoked or downscoped to project-only.

## Cutting a release

1. Bump the `version` in [`pyproject.toml`](pyproject.toml).
2. Commit:
   ```bash
   git commit -am "release(runx-py): <version>"
   ```
3. Tag with the `runx-py-v<version>` prefix and push:
   ```bash
   git tag runx-py-v<version>
   git push origin main --tags
   ```

The workflow triggers on `runx-py-v*.*.*` tags and will:

1. Check the tag matches `pyproject.toml` `version`.
2. Run the unit tests.
3. Build an sdist and wheel.
4. Run `twine check` on the built distributions.
5. Publish to PyPI via OIDC.
6. Create a GitHub release with auto-generated notes and the sdist + wheel attached.

If the tag does not match `pyproject.toml` the run fails before anything is published, so an out-of-sync tag is safe to delete and retry.

## Manual release (fallback)

If the workflow is unavailable, build and upload locally:

```bash
cd packages/sdk-python
rm -rf dist build *.egg-info
python3 -m build
python3 -m twine check dist/*
TWINE_USERNAME=__token__ TWINE_PASSWORD=<project-scoped-token> \
  python3 -m twine upload dist/*
```

Use a project-scoped token (`runx-py` only), never an account-wide one.
