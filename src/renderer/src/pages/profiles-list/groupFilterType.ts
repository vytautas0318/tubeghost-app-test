// The Group sidebar's selection value.
//
// Its own module to break a cycle: GroupSidebar imports the row components
// from GroupSidebarItem, which needs this type back. A type-only import is
// erased at build time, but the cycle is still real to a bundler and fails
// under a package build — so the shared type lives on its own.
export type GroupFilter = 'all' | 'ungrouped' | string
