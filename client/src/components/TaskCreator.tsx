import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCreateTask } from '@/hooks/useTasks';
import { CloudUpload, X, File, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000, 'Description too long'),
  priority: z.enum(['low', 'medium', 'high']),
  estimatedDuration: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface TaskCreatorProps {
  onTaskCreated?: (taskId: string) => void;
}

export default function TaskCreator({ onTaskCreated }: TaskCreatorProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();
  const createTaskMutation = useCreateTask();

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'medium',
      estimatedDuration: '',
    },
  });

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles = Array.from(selectedFiles).filter(file => {
      // Basic file validation
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        toast({
          title: 'File too large',
          description: `${file.name} is larger than 10MB`,
          variant: 'destructive',
        });
        return false;
      }
      return true;
    });

    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const onSubmit = async (data: TaskFormData) => {
    try {
      const result = await createTaskMutation.mutateAsync({
        ...data,
        files,
      });

      toast({
        title: 'Task Created Successfully',
        description: `Task "${data.title}" has been created and agent generation has begun.`,
      });

      // Reset form
      form.reset();
      setFiles([]);

      // Notify parent component
      onTaskCreated?.(result.id);
    } catch (error) {
      toast({
        title: 'Failed to Create Task',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-white">Create New Task</h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Describe your task and let Maestro generate a specialized team of AI agents to collaborate and complete it using the AutoAgents framework.
        </p>
      </div>

      {/* Task Creation Form */}
      <Card className="max-w-4xl mx-auto bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Task Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Task Title</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter a descriptive task title..."
                        className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Task Description</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={6}
                        placeholder="Describe the task requirements, goals, and expected outcomes in detail. The more specific you are, the better the agent team will be tailored to your needs..."
                        className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Priority and Duration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Priority</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="estimatedDuration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Expected Duration</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                            <SelectValue placeholder="Select duration" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="< 1 hour">Less than 1 hour</SelectItem>
                          <SelectItem value="1-4 hours">1-4 hours</SelectItem>
                          <SelectItem value="4-8 hours">4-8 hours</SelectItem>
                          <SelectItem value="1-3 days">1-3 days</SelectItem>
                          <SelectItem value="3+ days">3+ days</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* File Upload */}
              <div className="space-y-4">
                <FormLabel className="text-slate-300">Supporting Files (Optional)</FormLabel>
                
                {/* Drop Zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                    isDragOver 
                      ? "border-primary bg-primary/10" 
                      : "border-slate-600 hover:border-slate-500"
                  )}
                >
                  <CloudUpload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-300 font-medium mb-2">
                    Drop files here or click to upload
                  </p>
                  <p className="text-sm text-slate-400 mb-4">
                    Supports documents, images, code files, and more (max 10MB each)
                  </p>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    id="file-upload"
                    onChange={(e) => handleFileSelect(e.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('file-upload')?.click()}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    Choose Files
                  </Button>
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-400">Uploaded Files:</p>
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-slate-700 rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          <File className="w-4 h-4 text-slate-400" />
                          <div>
                            <p className="text-sm text-white">{file.name}</p>
                            <p className="text-xs text-slate-400">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                          className="text-slate-400 hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end space-x-4 pt-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    form.reset();
                    setFiles([]);
                  }}
                  disabled={createTaskMutation.isPending}
                  className="text-slate-300 hover:text-white"
                >
                  Clear Form
                </Button>
                <Button
                  type="submit"
                  disabled={createTaskMutation.isPending}
                  className="bg-gradient-to-r from-primary to-secondary text-white min-w-32"
                >
                  {createTaskMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Create Task
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
