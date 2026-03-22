# SDD 常见模式

本文档收集了在 AI 知识库助手项目中常用的开发模式，供编写 Spec 和实现代码时参考。

## 1. API 模式

### 1.1 标准 REST API

```typescript
// GET - 获取资源
app.get('/api/resources', (req, res) => {
  const resources = db.getAllResources();
  res.json({ resources });
});

// GET - 获取单个资源
app.get('/api/resources/:id', (req, res) => {
  const { id } = req.params;
  const resource = db.getResource(id);
  
  if (!resource) {
    return res.status(404).json({ error: '资源不存在' });
  }
  
  res.json({ resource });
});

// POST - 创建资源
app.post('/api/resources', (req, res) => {
  const { name, data } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '名称不能为空' });
  }
  
  const resource = db.createResource({ name, data });
  res.status(201).json({ resource });
});

// PATCH - 更新资源
app.patch('/api/resources/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  const success = db.updateResource(id, updates);
  
  if (!success) {
    return res.status(404).json({ error: '资源不存在' });
  }
  
  res.json({ success: true });
});

// DELETE - 删除资源
app.delete('/api/resources/:id', (req, res) => {
  const { id } = req.params;
  const success = db.deleteResource(id);
  
  if (!success) {
    return res.status(404).json({ error: '资源不存在' });
  }
  
  res.json({ success: true });
});
```

### 1.2 SSE 流式 API

用于需要实时推送数据的场景：

```typescript
app.get('/api/events', (req, res) => {
  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // 发送事件
  const sendEvent = (type: string, data: unknown) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };
  
  // 发送初始化事件
  sendEvent('init', { timestamp: Date.now() });
  
  // 处理数据流
  processStream((data) => {
    sendEvent('data', data);
  });
  
  // 发送完成事件
  sendEvent('done', {});
  res.end();
});
```

### 1.3 文件下载 API

```typescript
app.get('/api/download/:filename', (req, res) => {
  const { filename } = req.params;
  const content = generateContent();
  
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
});
```

## 2. 组件模式

### 2.1 带状态的功能组件

```tsx
interface FeatureProps {
  id: string;
  onSuccess?: () => void;
}

export const Feature: React.FC<FeatureProps> = ({ id, onSuccess }) => {
  // 状态
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  
  // 数据获取
  useEffect(() => {
    fetchData();
  }, [id]);
  
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/data/${id}`);
      const result = await response.json();
      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 操作处理
  const handleAction = async () => {
    try {
      await fetch(`/api/action/${id}`, { method: 'POST' });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };
  
  // 渲染
  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!data) return null;
  
  return (
    <div className="feature">
      {/* 内容 */}
    </div>
  );
};
```

### 2.2 受控表单组件

```tsx
interface FormData {
  name: string;
  email: string;
}

interface FormProps {
  initialData?: Partial<FormData>;
  onSubmit: (data: FormData) => Promise<void>;
}

export const Form: React.FC<FormProps> = ({ initialData, onSubmit }) => {
  const [formData, setFormData] = useState<FormData>({
    name: initialData?.name ?? '',
    email: initialData?.email ?? '',
  });
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // 清除该字段的错误
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };
  
  const validate = (): boolean => {
    const newErrors: Partial<FormData> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = '名称不能为空';
    }
    
    if (!formData.email.includes('@')) {
      newErrors.email = '邮箱格式不正确';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <Input
        value={formData.name}
        onChange={(val) => handleChange('name', val)}
        status={errors.name ? 'error' : 'default'}
        tips={errors.name}
      />
      <Input
        value={formData.email}
        onChange={(val) => handleChange('email', val)}
        status={errors.email ? 'error' : 'default'}
        tips={errors.email}
      />
      <Button type="submit" loading={isSubmitting}>
        提交
      </Button>
    </form>
  );
};
```

### 2.3 列表组件模式

```tsx
interface ListItem {
  id: string;
  title: string;
}

interface ListProps {
  items: ListItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export const List: React.FC<ListProps> = ({
  items,
  selectedId,
  onSelect,
  onDelete,
}) => {
  if (items.length === 0) {
    return <Empty description="暂无数据" />;
  }
  
  return (
    <div className="list">
      {items.map(item => (
        <ListItemComponent
          key={item.id}
          item={item}
          isSelected={item.id === selectedId}
          onSelect={() => onSelect(item.id)}
          onDelete={() => onDelete(item.id)}
        />
      ))}
    </div>
  );
};
```

## 3. Hook 模式

### 3.1 数据获取 Hook

```typescript
interface UseDataReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useData<T>(url: string): UseDataReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [url]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  return { data, isLoading, error, refetch: fetchData };
}
```

### 3.2 CRUD Hook

```typescript
interface UseCrudReturn<T> {
  items: T[];
  isLoading: boolean;
  create: (data: Partial<T>) => Promise<T>;
  update: (id: string, data: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCrud<T extends { id: string }>(
  baseUrl: string
): UseCrudReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const refresh = useCallback(async () => {
    const response = await fetch(baseUrl);
    const data = await response.json();
    setItems(data.items);
    setIsLoading(false);
  }, [baseUrl]);
  
  const create = useCallback(async (data: Partial<T>): Promise<T> => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    setItems(prev => [...prev, result.item]);
    return result.item;
  }, [baseUrl]);
  
  const update = useCallback(async (id: string, data: Partial<T>) => {
    await fetch(`${baseUrl}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...data } : item
    ));
  }, [baseUrl]);
  
  const remove = useCallback(async (id: string) => {
    await fetch(`${baseUrl}/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(item => item.id !== id));
  }, [baseUrl]);
  
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  return { items, isLoading, create, update, remove, refresh };
}
```

### 3.3 本地存储 Hook

```typescript
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });
  
  const setValue = (value: T | ((prev: T) => T)) => {
    const valueToStore = value instanceof Function ? value(storedValue) : value;
    setStoredValue(valueToStore);
    localStorage.setItem(key, JSON.stringify(valueToStore));
  };
  
  return [storedValue, setValue];
}
```

## 4. 数据库模式

### 4.1 标准 CRUD 操作

```typescript
// db.ts

export function createItem(data: CreateItemData): DbItem {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO items (id, name, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, data.name, JSON.stringify(data.data), now, now);
  
  return { id, ...data, created_at: now, updated_at: now };
}

export function getItem(id: string): DbItem | null {
  const stmt = db.prepare('SELECT * FROM items WHERE id = ?');
  return stmt.get(id) as DbItem | null;
}

export function getAllItems(): DbItem[] {
  const stmt = db.prepare('SELECT * FROM items ORDER BY created_at DESC');
  return stmt.all() as DbItem[];
}

export function updateItem(id: string, data: Partial<DbItem>): boolean {
  const updates = Object.entries(data)
    .filter(([key]) => key !== 'id')
    .map(([key]) => `${key} = ?`);
  
  if (updates.length === 0) return false;
  
  const values = Object.entries(data)
    .filter(([key]) => key !== 'id')
    .map(([, value]) => typeof value === 'object' ? JSON.stringify(value) : value);
  
  const stmt = db.prepare(`
    UPDATE items SET ${updates.join(', ')}, updated_at = ? WHERE id = ?
  `);
  
  const result = stmt.run(...values, new Date().toISOString(), id);
  return result.changes > 0;
}

export function deleteItem(id: string): boolean {
  const stmt = db.prepare('DELETE FROM items WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}
```

### 4.2 事务模式

```typescript
export function batchCreate(items: CreateItemData[]): DbItem[] {
  const insert = db.prepare(`
    INSERT INTO items (id, name, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const transaction = db.transaction((items: CreateItemData[]) => {
    const results: DbItem[] = [];
    const now = new Date().toISOString();
    
    for (const item of items) {
      const id = uuidv4();
      insert.run(id, item.name, JSON.stringify(item.data), now, now);
      results.push({ id, ...item, created_at: now, updated_at: now });
    }
    
    return results;
  });
  
  return transaction(items);
}
```

## 5. 错误处理模式

### 5.1 统一错误响应

```typescript
// 定义错误类型
class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// 错误处理中间件
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }
  
  res.status(500).json({
    error: '服务器内部错误',
  });
});

// 使用
app.get('/api/resource/:id', (req, res, next) => {
  try {
    const resource = db.getResource(req.params.id);
    
    if (!resource) {
      throw new ApiError(404, '资源不存在', 'RESOURCE_NOT_FOUND');
    }
    
    res.json({ resource });
  } catch (err) {
    next(err);
  }
});
```

### 5.2 前端错误处理

```typescript
// 通用请求函数
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// 使用
try {
  const data = await request<Data>('/api/resource');
  // 处理成功
} catch (error) {
  // 显示错误提示
  MessagePlugin.error(error instanceof Error ? error.message : '请求失败');
}
```
