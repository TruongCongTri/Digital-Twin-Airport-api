import { prisma } from '@/common/configs/prisma';
import { APP_CONFIG } from '@/constants/app.constant';

/**
 * @class BaseRepository
 * @description Abstract generic repository providing foundational CRUD operations and pagination
 * for all Prisma models. Ensures uniform database access patterns across the application.
 * @template T - The primary Prisma database model type (e.g., ScoreEvent, User)
 */
export abstract class BaseRepository<T> {
  protected model: any;

  /**
   * @constructor
   * @description Initializes the repository with the specified Prisma model delegate.
   * @param modelName - The exact string representation of the Prisma model (e.g., 'scoreEvent')
   */
  constructor(modelName: string) {
    this.model = (prisma as any)[modelName];
  }

  /**
   * @method findById
   * @description Retrieves a single record by its UUID.
   * @param id - The strictly validated UUID of the record
   * @param options - Optional Prisma selection or inclusion parameters for relational data
   * @returns The strongly-typed record if found, or null
   */
  public async findById(id: string, options?: { select?: any; include?: any }): Promise<T | null> {
    return this.model.findUnique({
      where: { id },
      ...options,
    }) as Promise<T | null>;
  }

  /**
   * @method findAll
   * @description Retrieves all records for the model without pagination.
   * WARNING: Use cautiously on large tables to prevent memory exhaustion.
   * Prefer `executePagination` for unbounded datasets.
   * @returns An array of all strongly-typed records
   */
  async findAll(): Promise<T[]> {
    return this.model.findMany() as Promise<T[]>;
  }

  /**
   * @method update
   * @description Updates a single record by its UUID.
   * @param id - The UUID of the record to update
   * @param data - The partial data payload to apply
   * @returns The fully updated, strongly-typed record
   */
  public async update(id: string, data: Record<string, any>): Promise<T> {
    return this.model.update({
      where: { id },
      data,
    }) as Promise<T>;
  }

  /**
   * @method delete
   * @description Permanently removes a record from the database by its UUID.
   * @param id - The UUID of the record to delete
   * @returns The deleted record data
   */
  public async delete(id: string): Promise<T> {
    return this.model.delete({
      where: { id },
    }) as Promise<T>;
  }

  /**
   * @method executePagination
   * @description A universally typed pagination executor for Prisma models.
   * @template ResultType - The expected database model type (e.g., ScoreEvent or PlayerScore)
   * @param args - Prisma findMany arguments (where, skip, take, orderBy)
   * @param overrideModel - Optional Prisma model delegate to query a different table
   * @returns An object containing the exact total count and the strongly-typed array of records
   */
  protected async executePagination<ResultType>(
    args: any,
    overrideModel?: any
  ): Promise<{ total: number; data: ResultType[] }> {
    const targetModel = overrideModel || this.model;

    const safeSkip = parseInt(String(args.skip), 10) || APP_CONFIG.COMMON.PAGINATION.DEFAULT_SKIP;
    const safeTake = parseInt(String(args.take), 10) || APP_CONFIG.COMMON.PAGINATION.DEFAULT_LIMIT;

    const [total, data] = await prisma.$transaction([
      targetModel.count({ where: args.where || {} }),
      targetModel.findMany({ ...args, skip: safeSkip, take: safeTake }),
    ]);
    return { total, data: data as ResultType[] };
  }
}
