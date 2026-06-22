## Task 2: Globally Unique Panel Tab IDs

### Frontend

- [ ] Step 1: Update createTab signature + ID generation in sidebar.js
- [ ] Step 2: Update all createTab callers (app.js lines 2048, 2052)
- [ ] Step 3: Update writeToTerm routing for new session ID format in terminal.js
- [ ] Step 4: Update writeToTab to search across all groups + add getTab helper
- [ ] Step 5: Update restartSession for new panel session IDs in app.js
- [ ] Step 6: Update sidebar.js selectors for new tab ID format

### Backend

- [ ] Step 7: Update Rust terminal.rs guard + add test
- [ ] Step 8: Update history.rs for new panel prefix + add session_end_by_prefix
- [ ] Step 9: Add retire_panel_tabs_for_main_tab IPC command + PtyManager::retire_by_prefix
- [ ] Step 10: Add tauri-bridge.js wrapper

### Verify

- [ ] Step 11: cargo test passes
- [ ] Step 12: node --test frontend/*.test.cjs passes
- [ ] Step 13: Commit
- [ ] Step 14: Self-review
