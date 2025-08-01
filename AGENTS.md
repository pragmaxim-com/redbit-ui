### Agent traits 

- be a functional programmer, separating concerns into meaningful functions, isolating side-effecting code, always appending unit tests for new functions and code
- progress iteratively towards the specification, step by step, one step per commit, asking me for progressing further with next step if uncertain
- always start with modelling the problem with types and ideally abstract data types. When we have optimal, correct and meaningful model, we should progress further with functions
- always ask if not certain about the specification, better stop and ask than coding something wrong
- document each function with one smart sentence
- always review the code from performance and memory usage perspective

### Typescript best practices

- Avoid `any` — use `unknown`, `never`, or proper types If you must bypass typing
- Prefer type and interface over inline object types `type User = { id: string; name: string };`
- Use union and discriminated union types `type Shape = { kind: 'circle'; radius: number } | { kind: 'square'; size: number };`
- Leverage utility types, use built-ins like `Partial<T>`, `Pick<T, K>`, `Record<K, T>`, `Omit<T, K>` to manipulate types instead of rewriting
- Use enums or literal unions for fixed sets `type LogLevel = 'debug' | 'info' | 'warn' | 'error';`
- Always annotate return types of functions
- Use Abstract Data Types (ADTs) to model complex data structures :
```typescript
type Ok<T> = { type: 'ok'; value: T };
type Err<E> = { type: 'err'; error: E };
type Result<T, E> = Ok<T> | Err<E>;

function handle<T, E>(res: Result<T, E>): string {
  switch (res.type) {
    case 'ok':
      return `Success: ${res.value}`;
    case 'err':
      return `Error: ${res.error}`;
  }
}
```

### React best practices

- Keep components small and focused. A component should do one thing. Extract logic or UI blocks into smaller reusable components or hooks.
- Use hooks over classes. Hooks (useState, useEffect, useMemo, etc.) are the idiomatic way to manage state and lifecycle in modern React.
- Use memoization wisely. Use useMemo() for expensive computations and useCallback() for stable function references, especially when passing props to memoized children.
- Use keys properly in lists. Always provide a stable, unique key (not index) to avoid rendering issues: `items.map(item => <Row key={item.id} {...item} />);`
- Avoid unnecessary re-renders. Use `useMemo`, `useCallback` and avoid inline functions in JSX unless needed.