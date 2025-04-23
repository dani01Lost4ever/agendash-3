import { Schema, model } from 'mongoose';

export interface ITaskLog {
  taskId: string;
  taskName: string;
  status: 'started' | 'completed' | 'failed';
  message: string;
  timestamp: Date;
  data?: any;
}

export const taskLogSchema = new Schema<ITaskLog>({
  taskId: { type: String, required: true },
  taskName: { type: String, required: true },
  status: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  data: { type: Schema.Types.Mixed }
});

export const TaskLog = model<ITaskLog>('TaskLog', taskLogSchema);
