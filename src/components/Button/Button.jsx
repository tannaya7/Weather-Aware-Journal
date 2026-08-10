import styles from './Button.module.css';

const VARIANT_CLASS = {
  primary: styles.primary,
  secondary: styles.secondary,
  danger: styles.danger,
};

export function Button({ variant = 'primary', small = false, className = '', ...props }) {
  const classes = [styles.base, VARIANT_CLASS[variant], small ? styles.small : '', className]
    .filter(Boolean)
    .join(' ');
  return <button className={classes} {...props} />;
}
