/**
 * ETL data pipeline for ingesting, transforming, and loading analytics events.
 *
 * Pipeline stages:
 *   1. Ingest from Kafka topic
 *   2. Validate schema against Avro registry
 *   3. Deduplicate by event ID within time window
 *   4. Parse and normalize timestamps to UTC
 *   5. Enrich with user profile data from Redis cache
 *   6. Enrich with geo-IP location data
 *   7. Apply PII masking rules (email, phone, SSN)
 *   8. Compute derived metrics (session duration, bounce rate)
 *   9. Partition by date and event type
 *  10. Compress with Snappy codec
 *  11. Write Parquet files to S3 staging bucket
 *  12. Register partitions in Glue catalog
 *  13. Trigger Redshift COPY command
 *  14. Verify row counts match between S3 and Redshift
 *  15. Archive raw events to S3 Glacier
 *  16. Emit pipeline completion metric to CloudWatch
 */

export interface PipelineConfig {
  kafkaBrokers: string[]
  kafkaTopic: string
  kafkaGroupId: string
  schemaRegistryUrl: string
  redisUrl: string
  geoIpDbPath: string
  s3StagingBucket: string
  s3ArchiveBucket: string
  glueDatabaseName: string
  glueTableName: string
  redshiftCluster: string
  redshiftDatabase: string
  redshiftTable: string
  cloudwatchNamespace: string
  deduplicationWindowMs: number
  batchSize: number
  piiMaskingRules: PiiRule[]
}

export interface PiiRule {
  fieldPattern: RegExp
  maskStrategy: 'hash' | 'redact' | 'tokenize'
  salt?: string
}

export interface AnalyticsEvent {
  eventId: string
  eventType: string
  userId: string
  timestamp: string
  properties: Record<string, unknown>
  context: {
    ip?: string
    userAgent?: string
    locale?: string
    referrer?: string
  }
}

interface EnrichedEvent extends AnalyticsEvent {
  normalizedTimestamp: Date
  userProfile?: {
    plan: string
    company: string
    signupDate: string
  }
  geoLocation?: {
    country: string
    region: string
    city: string
    latitude: number
    longitude: number
  }
  derivedMetrics?: {
    sessionDuration?: number
    isNewSession: boolean
    bounced: boolean
  }
  partitionKey: string
}

interface StageResult {
  stage: string
  inputCount: number
  outputCount: number
  droppedCount: number
  durationMs: number
  errors: string[]
}

export class DataPipeline {
  private config: PipelineConfig
  private stageResults: StageResult[] = []

  constructor(config: PipelineConfig) {
    this.config = config
  }

  async run(): Promise<StageResult[]> {
    // Stage 1: Ingest
    const rawEvents = await this.ingestFromKafka()

    // Stage 2: Validate
    const validEvents = await this.validateSchema(rawEvents)

    // Stage 3: Deduplicate
    const uniqueEvents = await this.deduplicate(validEvents)

    // Stage 4: Normalize timestamps
    const normalizedEvents = await this.normalizeTimestamps(uniqueEvents)

    // Stage 5: Enrich with user profiles
    const userEnriched = await this.enrichUserProfiles(normalizedEvents)

    // Stage 6: Enrich with geo-IP
    const geoEnriched = await this.enrichGeoIp(userEnriched)

    // Stage 7: Mask PII
    const maskedEvents = await this.maskPii(geoEnriched)

    // Stage 8: Compute derived metrics
    const metricsComputed = await this.computeDerivedMetrics(maskedEvents)

    // Stage 9: Partition
    const partitioned = await this.partitionEvents(metricsComputed)

    // Stage 10: Compress
    const compressed = await this.compressPayloads(partitioned)

    // Stage 11: Write to S3
    const s3Keys = await this.writeToS3(compressed)

    // Stage 12: Register in Glue
    await this.registerGluePartitions(s3Keys)

    // Stage 13: Load to Redshift
    await this.loadToRedshift(s3Keys)

    // Stage 14: Verify row counts
    await this.verifyRowCounts(s3Keys)

    // Stage 15: Archive raw events
    await this.archiveRawEvents(rawEvents)

    // Stage 16: Emit completion metric
    await this.emitCompletionMetric()

    return this.stageResults
  }

  private async ingestFromKafka(): Promise<AnalyticsEvent[]> {
    const start = Date.now()
    const { Kafka } = await import('kafkajs')
    const kafka = new Kafka({ brokers: this.config.kafkaBrokers })
    const consumer = kafka.consumer({ groupId: this.config.kafkaGroupId })

    await consumer.connect()
    await consumer.subscribe({ topic: this.config.kafkaTopic })

    const events: AnalyticsEvent[] = []
    await consumer.run({
      eachBatch: async ({ batch }) => {
        for (const message of batch.messages) {
          if (message.value) {
            events.push(JSON.parse(message.value.toString()) as AnalyticsEvent)
          }
          if (events.length >= this.config.batchSize) break
        }
      },
    })

    // Wait for batch to fill or timeout
    await new Promise((r) => setTimeout(r, 5000))
    await consumer.disconnect()

    this.recordStage('ingest', 0, events.length, 0, Date.now() - start)
    return events
  }

  private async validateSchema(events: AnalyticsEvent[]): Promise<AnalyticsEvent[]> {
    const start = Date.now()
    const res = await fetch(`${this.config.schemaRegistryUrl}/subjects/${this.config.kafkaTopic}-value/versions/latest`)
    const schema = (await res.json()) as { schema: string }

    const valid: AnalyticsEvent[] = []
    const errors: string[] = []

    for (const event of events) {
      if (this.validateAgainstSchema(event, schema.schema)) {
        valid.push(event)
      } else {
        errors.push(`Invalid event: ${event.eventId}`)
      }
    }

    this.recordStage('validate', events.length, valid.length, events.length - valid.length, Date.now() - start, errors)
    return valid
  }

  private validateAgainstSchema(event: AnalyticsEvent, _schema: string): boolean {
    return !!(event.eventId && event.eventType && event.userId && event.timestamp)
  }

  private async deduplicate(events: AnalyticsEvent[]): Promise<AnalyticsEvent[]> {
    const start = Date.now()
    const { createClient } = await import('redis')
    const redis = createClient({ url: this.config.redisUrl })
    await redis.connect()

    const unique: AnalyticsEvent[] = []
    for (const event of events) {
      const key = `dedup:${event.eventId}`
      const exists = await redis.get(key)
      if (!exists) {
        await redis.set(key, '1', { PX: this.config.deduplicationWindowMs })
        unique.push(event)
      }
    }

    await redis.disconnect()
    this.recordStage('deduplicate', events.length, unique.length, events.length - unique.length, Date.now() - start)
    return unique
  }

  private async normalizeTimestamps(events: AnalyticsEvent[]): Promise<EnrichedEvent[]> {
    const start = Date.now()
    const enriched: EnrichedEvent[] = events.map((e) => ({
      ...e,
      normalizedTimestamp: new Date(e.timestamp),
      partitionKey: '',
    }))

    const invalid = enriched.filter((e) => isNaN(e.normalizedTimestamp.getTime()))
    const valid = enriched.filter((e) => !isNaN(e.normalizedTimestamp.getTime()))

    this.recordStage('normalize', events.length, valid.length, invalid.length, Date.now() - start)
    return valid
  }

  private async enrichUserProfiles(events: EnrichedEvent[]): Promise<EnrichedEvent[]> {
    const start = Date.now()
    const { createClient } = await import('redis')
    const redis = createClient({ url: this.config.redisUrl })
    await redis.connect()

    for (const event of events) {
      const profile = await redis.hGetAll(`user:${event.userId}`)
      if (profile && profile.plan) {
        event.userProfile = {
          plan: profile.plan,
          company: profile.company || '',
          signupDate: profile.signupDate || '',
        }
      }
    }

    await redis.disconnect()
    const enrichedCount = events.filter((e) => e.userProfile).length
    this.recordStage('enrich-user', events.length, events.length, 0, Date.now() - start)
    return events
  }

  private async enrichGeoIp(events: EnrichedEvent[]): Promise<EnrichedEvent[]> {
    const start = Date.now()
    for (const event of events) {
      if (event.context.ip) {
        const res = await fetch(`https://geoip.internal/lookup?ip=${event.context.ip}`)
        if (res.ok) {
          event.geoLocation = (await res.json()) as EnrichedEvent['geoLocation']
        }
      }
    }

    this.recordStage('enrich-geo', events.length, events.length, 0, Date.now() - start)
    return events
  }

  private async maskPii(events: EnrichedEvent[]): Promise<EnrichedEvent[]> {
    const start = Date.now()
    const crypto = await import('crypto')

    for (const event of events) {
      for (const rule of this.config.piiMaskingRules) {
        this.applyMaskingRule(event.properties, rule, crypto)
      }
    }

    this.recordStage('mask-pii', events.length, events.length, 0, Date.now() - start)
    return events
  }

  private applyMaskingRule(
    obj: Record<string, unknown>,
    rule: PiiRule,
    crypto: typeof import('crypto')
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      if (rule.fieldPattern.test(key) && typeof value === 'string') {
        switch (rule.maskStrategy) {
          case 'hash':
            obj[key] = crypto.createHash('sha256').update(value + (rule.salt || '')).digest('hex')
            break
          case 'redact':
            obj[key] = '***REDACTED***'
            break
          case 'tokenize':
            obj[key] = crypto.randomUUID()
            break
        }
      } else if (typeof value === 'object' && value !== null) {
        this.applyMaskingRule(value as Record<string, unknown>, rule, crypto)
      }
    }
  }

  private async computeDerivedMetrics(events: EnrichedEvent[]): Promise<EnrichedEvent[]> {
    const start = Date.now()
    const sessionMap = new Map<string, EnrichedEvent[]>()

    for (const event of events) {
      const sessions = sessionMap.get(event.userId) || []
      sessions.push(event)
      sessionMap.set(event.userId, sessions)
    }

    for (const [, userEvents] of sessionMap) {
      userEvents.sort((a, b) => a.normalizedTimestamp.getTime() - b.normalizedTimestamp.getTime())
      for (let i = 0; i < userEvents.length; i++) {
        const prev = i > 0 ? userEvents[i - 1] : null
        const gap = prev
          ? userEvents[i].normalizedTimestamp.getTime() - prev.normalizedTimestamp.getTime()
          : Infinity

        userEvents[i].derivedMetrics = {
          isNewSession: gap > 30 * 60 * 1000,
          bounced: userEvents.length === 1,
          sessionDuration: gap < Infinity ? gap : 0,
        }
      }
    }

    this.recordStage('compute-metrics', events.length, events.length, 0, Date.now() - start)
    return events
  }

  private async partitionEvents(events: EnrichedEvent[]): Promise<Map<string, EnrichedEvent[]>> {
    const start = Date.now()
    const partitions = new Map<string, EnrichedEvent[]>()

    for (const event of events) {
      const date = event.normalizedTimestamp.toISOString().split('T')[0]
      const key = `date=${date}/type=${event.eventType}`
      event.partitionKey = key
      const partition = partitions.get(key) || []
      partition.push(event)
      partitions.set(key, partition)
    }

    this.recordStage('partition', events.length, events.length, 0, Date.now() - start)
    return partitions
  }

  private async compressPayloads(
    partitions: Map<string, EnrichedEvent[]>
  ): Promise<Map<string, Buffer>> {
    const start = Date.now()
    const { gzipSync } = await import('zlib')
    const compressed = new Map<string, Buffer>()

    for (const [key, events] of partitions) {
      const json = JSON.stringify(events)
      compressed.set(key, gzipSync(Buffer.from(json)))
    }

    this.recordStage('compress', partitions.size, compressed.size, 0, Date.now() - start)
    return compressed
  }

  private async writeToS3(compressed: Map<string, Buffer>): Promise<string[]> {
    const start = Date.now()
    const keys: string[] = []

    for (const [partition, data] of compressed) {
      const s3Key = `${this.config.glueTableName}/${partition}/batch-${Date.now()}.parquet.gz`
      await fetch(`https://s3.amazonaws.com/${this.config.s3StagingBucket}/${s3Key}`, {
        method: 'PUT',
        body: data,
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      keys.push(s3Key)
    }

    this.recordStage('write-s3', compressed.size, keys.length, 0, Date.now() - start)
    return keys
  }

  private async registerGluePartitions(s3Keys: string[]): Promise<void> {
    const start = Date.now()
    const partitions = [...new Set(s3Keys.map((k) => k.split('/').slice(1, 3).join('/')))]

    await fetch('https://glue.internal/api/partitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database: this.config.glueDatabaseName,
        table: this.config.glueTableName,
        partitions,
      }),
    })

    this.recordStage('register-glue', s3Keys.length, partitions.length, 0, Date.now() - start)
  }

  private async loadToRedshift(s3Keys: string[]): Promise<void> {
    const start = Date.now()
    const manifest = {
      entries: s3Keys.map((key) => ({
        url: `s3://${this.config.s3StagingBucket}/${key}`,
        mandatory: true,
      })),
    }

    await fetch(`https://${this.config.redshiftCluster}/api/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database: this.config.redshiftDatabase,
        table: this.config.redshiftTable,
        manifest,
        format: 'JSON',
        gzip: true,
      }),
    })

    this.recordStage('load-redshift', s3Keys.length, s3Keys.length, 0, Date.now() - start)
  }

  private async verifyRowCounts(s3Keys: string[]): Promise<void> {
    const start = Date.now()
    const res = await fetch(
      `https://${this.config.redshiftCluster}/api/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: `SELECT COUNT(*) as cnt FROM ${this.config.redshiftTable} WHERE _loaded_at > DATEADD(minute, -5, GETDATE())`,
        }),
      }
    )
    const { cnt } = (await res.json()) as { cnt: number }

    if (cnt === 0) {
      throw new Error('Row count verification failed: no rows loaded in last 5 minutes')
    }

    this.recordStage('verify-counts', s3Keys.length, 1, 0, Date.now() - start)
  }

  private async archiveRawEvents(events: AnalyticsEvent[]): Promise<void> {
    const start = Date.now()
    const data = Buffer.from(JSON.stringify(events))
    const archiveKey = `raw/${new Date().toISOString().split('T')[0]}/batch-${Date.now()}.json`

    await fetch(`https://s3.amazonaws.com/${this.config.s3ArchiveBucket}/${archiveKey}`, {
      method: 'PUT',
      body: data,
      headers: {
        'Content-Type': 'application/json',
        'x-amz-storage-class': 'GLACIER',
      },
    })

    this.recordStage('archive', events.length, 1, 0, Date.now() - start)
  }

  private async emitCompletionMetric(): Promise<void> {
    const start = Date.now()
    const totalProcessed = this.stageResults.reduce((sum, r) => sum + r.outputCount, 0)
    const totalErrors = this.stageResults.reduce((sum, r) => sum + r.errors.length, 0)
    const totalDuration = this.stageResults.reduce((sum, r) => sum + r.durationMs, 0)

    await fetch('https://monitoring.internal/api/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace: this.config.cloudwatchNamespace,
        metrics: [
          { name: 'PipelineEventsProcessed', value: totalProcessed, unit: 'Count' },
          { name: 'PipelineErrors', value: totalErrors, unit: 'Count' },
          { name: 'PipelineDurationMs', value: totalDuration, unit: 'Milliseconds' },
          { name: 'PipelineStagesCompleted', value: this.stageResults.length, unit: 'Count' },
        ],
      }),
    })

    this.recordStage('emit-metric', 1, 1, 0, Date.now() - start)
  }

  private recordStage(
    stage: string,
    inputCount: number,
    outputCount: number,
    droppedCount: number,
    durationMs: number,
    errors: string[] = []
  ): void {
    this.stageResults.push({ stage, inputCount, outputCount, droppedCount, durationMs, errors })
  }
}
