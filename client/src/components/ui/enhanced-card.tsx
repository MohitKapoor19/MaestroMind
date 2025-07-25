import * as React from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react"

interface EnhancedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  status?: 'active' | 'pending' | 'completed' | 'error'
  progress?: number
  isCollapsible?: boolean
  defaultExpanded?: boolean
  actions?: React.ReactNode
  variant?: 'default' | 'gradient' | 'glass'
}

const EnhancedCard = React.forwardRef<HTMLDivElement, EnhancedCardProps>(
  ({ 
    className, 
    title, 
    description, 
    status, 
    progress, 
    isCollapsible = false, 
    defaultExpanded = true,
    actions,
    variant = 'default',
    children, 
    ...props 
  }, ref) => {
    const [isExpanded, setIsExpanded] = React.useState(defaultExpanded)

    const getStatusColor = (status?: string) => {
      switch (status) {
        case 'active':
          return 'bg-green-500/20 text-green-400 border-green-500/30'
        case 'pending':
          return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
        case 'completed':
          return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        case 'error':
          return 'bg-red-500/20 text-red-400 border-red-500/30'
        default:
          return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
      }
    }

    const getVariantClasses = () => {
      switch (variant) {
        case 'gradient':
          return 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600 shadow-xl'
        case 'glass':
          return 'bg-slate-800/50 backdrop-blur-md border-slate-600/50 shadow-2xl'
        default:
          return 'bg-slate-800 border-slate-700'
      }
    }

    return (
      <Card
        ref={ref}
        className={cn(
          getVariantClasses(),
          'transition-all duration-200 hover:shadow-lg',
          className
        )}
        {...props}
      >
        {(title || description || status || isCollapsible || actions) && (
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {title && (
                  <div className="flex items-center space-x-3">
                    {isCollapsible && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-white"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <CardTitle className="text-white text-lg">{title}</CardTitle>
                    {status && (
                      <Badge 
                        variant="outline" 
                        className={cn("capitalize text-xs", getStatusColor(status))}
                      >
                        {status}
                      </Badge>
                    )}
                  </div>
                )}
                {description && (
                  <CardDescription className="text-slate-400 mt-1">
                    {description}
                  </CardDescription>
                )}
                {typeof progress === 'number' && (
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Progress</span>
                      <span className="text-white">{Math.round(progress)}%</span>
                    </div>
                    <Progress 
                      value={progress} 
                      className="h-2"
                    />
                  </div>
                )}
              </div>
              {actions && (
                <div className="flex items-center space-x-2">
                  {actions}
                </div>
              )}
            </div>
          </CardHeader>
        )}
        
        {(!isCollapsible || isExpanded) && (
          <CardContent className={cn(title || description ? "pt-0" : "")}>
            {children}
          </CardContent>
        )}
      </Card>
    )
  }
)

EnhancedCard.displayName = "EnhancedCard"

export { EnhancedCard }