export async function asyncFromCallback<T>(
  fn: (cb: (err: any, data: T) => any) => any,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fn((err, data) => (err ? reject(err) : resolve(data)));
  });
}
