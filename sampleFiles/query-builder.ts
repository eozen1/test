type WhereCondition = {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL';
  value?: any;
};

type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

type OrderDirection = 'ASC' | 'DESC';

export class QueryBuilder {
  private table: string = '';
  private selectFields: string[] = ['*'];
  private whereConditions: WhereCondition[] = [];
  private joins: { type: JoinType; table: string; on: string }[] = [];
  private orderByFields: { field: string; direction: OrderDirection }[] = [];
  private groupByFields: string[] = [];
  private havingConditions: string[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private isDistinct = false;

  from(table: string): this {
    this.table = table;
    return this;
  }

  select(...fields: string[]): this {
    this.selectFields = fields.length > 0 ? fields : ['*'];
    return this;
  }

  distinct(): this {
    this.isDistinct = true;
    return this;
  }

  where(field: string, operator: WhereCondition['operator'], value?: any): this {
    this.whereConditions.push({ field, operator, value });
    return this;
  }

  whereNull(field: string): this {
    return this.where(field, 'IS NULL');
  }

  whereNotNull(field: string): this {
    return this.where(field, 'IS NOT NULL');
  }

  whereIn(field: string, values: any[]): this {
    return this.where(field, 'IN', values);
  }

  join(table: string, on: string, type: JoinType = 'INNER'): this {
    this.joins.push({ type, table, on });
    return this;
  }

  leftJoin(table: string, on: string): this {
    return this.join(table, on, 'LEFT');
  }

  rightJoin(table: string, on: string): this {
    return this.join(table, on, 'RIGHT');
  }

  orderBy(field: string, direction: OrderDirection = 'ASC'): this {
    this.orderByFields.push({ field, direction });
    return this;
  }

  groupBy(...fields: string[]): this {
    this.groupByFields.push(...fields);
    return this;
  }

  having(condition: string): this {
    this.havingConditions.push(condition);
    return this;
  }

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  offset(value: number): this {
    this.offsetValue = value;
    return this;
  }

  build(): { sql: string; params: any[] } {
    if (!this.table) throw new Error('Table name is required');

    const params: any[] = [];
    const parts: string[] = [];

    // SELECT
    const distinctStr = this.isDistinct ? 'DISTINCT ' : '';
    parts.push(`SELECT ${distinctStr}${this.selectFields.join(', ')}`);

    // FROM
    parts.push(`FROM ${this.table}`);

    // JOINs
    for (const join of this.joins) {
      parts.push(`${join.type} JOIN ${join.table} ON ${join.on}`);
    }

    // WHERE
    if (this.whereConditions.length > 0) {
      const conditions = this.whereConditions.map(cond => {
        if (cond.operator === 'IS NULL' || cond.operator === 'IS NOT NULL') {
          return `${cond.field} ${cond.operator}`;
        }
        if (cond.operator === 'IN' || cond.operator === 'NOT IN') {
          const placeholders = (cond.value as any[]).map(() => {
            params.push(cond.value.shift());
            return '?';
          });
          return `${cond.field} ${cond.operator} (${placeholders.join(', ')})`;
        }
        params.push(cond.value);
        return `${cond.field} ${cond.operator} ?`;
      });
      parts.push(`WHERE ${conditions.join(' AND ')}`);
    }

    // GROUP BY
    if (this.groupByFields.length > 0) {
      parts.push(`GROUP BY ${this.groupByFields.join(', ')}`);
    }

    // HAVING
    if (this.havingConditions.length > 0) {
      parts.push(`HAVING ${this.havingConditions.join(' AND ')}`);
    }

    // ORDER BY
    if (this.orderByFields.length > 0) {
      const orders = this.orderByFields.map(o => `${o.field} ${o.direction}`);
      parts.push(`ORDER BY ${orders.join(', ')}`);
    }

    // LIMIT & OFFSET
    if (this.limitValue !== undefined) {
      parts.push(`LIMIT ${this.limitValue}`);
    }
    if (this.offsetValue !== undefined) {
      parts.push(`OFFSET ${this.offsetValue}`);
    }

    return { sql: parts.join(' '), params };
  }

  toString(): string {
    return this.build().sql;
  }
}

export function query(table: string): QueryBuilder {
  return new QueryBuilder().from(table);
}
